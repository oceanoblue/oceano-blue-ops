import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.mjs';
import { safeResolveWithinRoots, isRawFile, mimeFromExt } from './safety.mjs';

const PROFILE = {
  natural: {
    exposure: 1.03,
    saturation: 1.08,
    contrast: 1.06,
    gamma: 1.04,
    sharpen: 0.28,
    quality: 92,
  },
  airy: {
    exposure: 1.08,
    saturation: 1.04,
    contrast: 0.98,
    gamma: 0.96,
    sharpen: 0.24,
    quality: 92,
  },
  luxury: {
    exposure: 1.02,
    saturation: 1.1,
    contrast: 1.1,
    gamma: 1.03,
    sharpen: 0.32,
    quality: 93,
  },
};

function sanitizeName(name) {
  return String(name || 'photo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'photo';
}

function baseNameFromItem(item) {
  return sanitizeName(
    item.output_name ||
      item.files?.[0]?.filename ||
      item.source_asset_ids?.[0] ||
      `processed-${Date.now()}`
  );
}

function luma(r, g, b) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

async function readNormalized(file, size) {
  const resolved = safeResolveWithinRoots(config.roots, file.local_path);
  if (!resolved) throw new Error(`outside_allowlist: ${file.local_path}`);
  if (isRawFile(resolved)) {
    throw new Error(`raw_not_supported_by_local_process: ${path.basename(resolved)}`);
  }
  const meta = await fs.stat(resolved);
  if (!meta.isFile()) throw new Error(`not_a_file: ${resolved}`);

  let img = sharp(resolved, { failOn: 'none' })
    .rotate()
    .resize(size ? { width: size.width, height: size.height, fit: 'fill' } : {
      width: 4096,
      height: 4096,
      fit: 'inside',
      withoutEnlargement: true,
      kernel: 'lanczos3',
    })
    .removeAlpha()
    .toColorspace('srgb');

  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels, filename: file.filename };
}

function mergeRaw(frames) {
  const sorted = [...frames].sort((a, b) => (a.exposure_bias ?? 0) - (b.exposure_bias ?? 0));
  const darkest = sorted[0].raw.data;
  const brightest = sorted[sorted.length - 1].raw.data;
  const base = sorted[Math.floor(sorted.length / 2)].raw.data;
  const { width, height } = sorted[0].raw;
  const px = width * height;
  const out = Buffer.allocUnsafe(px * 3);

  for (let i = 0; i < px; i++) {
    const o = i * 3;
    const L = luma(base[o], base[o + 1], base[o + 2]);
    let wH = 0;
    let wS = 0;
    if (L > 168) wH = Math.min(0.82, ((L - 168) / 87) * 0.82);
    else if (L < 82) wS = Math.min(0.72, ((82 - L) / 82) * 0.72);
    const wB = 1 - wH - wS;
    out[o] = (base[o] * wB + darkest[o] * wH + brightest[o] * wS + 0.5) | 0;
    out[o + 1] = (base[o + 1] * wB + darkest[o + 1] * wH + brightest[o + 1] * wS + 0.5) | 0;
    out[o + 2] = (base[o + 2] * wB + darkest[o + 2] * wH + brightest[o + 2] * wS + 0.5) | 0;
  }

  return { data: out, width, height, channels: 3 };
}

async function grade(buf, profile) {
  const p = PROFILE[profile] ?? PROFILE.natural;
  return sharp(buf, { failOn: 'none' })
    .linear(p.exposure, -((p.exposure - 1) * 14))
    .gamma(Math.max(1, p.gamma))
    .linear(p.contrast, -((p.contrast - 1) * 128))
    .modulate({ saturation: p.saturation })
    .median(1)
    .sharpen({ sigma: 0.7, m1: 0, m2: 1.2 + p.sharpen })
    .jpeg({ quality: p.quality, mozjpeg: true, progressive: true })
    .toBuffer();
}

async function processItem(item, jobId, profile) {
  const files = item.files ?? [];
  if (files.length === 0) throw new Error('no_files');

  const outputDir = path.join(config.outputRoot, sanitizeName(jobId || 'misc'));
  await fs.mkdir(outputDir, { recursive: true });
  const outputName = `${baseNameFromItem(item)}-${item.kind === 'bracket' ? 'hdr' : 'enhanced'}.jpg`;
  const outputPath = path.join(outputDir, outputName);

  let baseBuffer;
  let mode = 'single';

  if (item.kind === 'bracket' && files.length > 1) {
    const first = await readNormalized(files[0]);
    const frames = [{ raw: first, exposure_bias: files[0].exposure_bias ?? 0 }];
    for (const f of files.slice(1)) {
      frames.push({
        raw: await readNormalized(f, { width: first.width, height: first.height }),
        exposure_bias: f.exposure_bias ?? 0,
      });
    }
    const merged = mergeRaw(frames);
    baseBuffer = await sharp(merged.data, {
      raw: { width: merged.width, height: merged.height, channels: merged.channels },
    }).jpeg({ quality: 95, mozjpeg: true }).toBuffer();
    mode = 'hdr_merge';
  } else {
    const resolved = safeResolveWithinRoots(config.roots, files[0].local_path);
    if (!resolved) throw new Error(`outside_allowlist: ${files[0].local_path}`);
    if (isRawFile(resolved)) throw new Error(`raw_not_supported_by_local_process: ${path.basename(resolved)}`);
    baseBuffer = await sharp(resolved, { failOn: 'none' })
      .rotate()
      .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
      .jpeg({ quality: 94, mozjpeg: true })
      .toBuffer();
  }

  const final = await grade(baseBuffer, profile);
  let savedPath = outputPath;
  await fs.writeFile(outputPath, final, { flag: 'wx' }).catch(async (err) => {
    if (err?.code !== 'EEXIST') throw err;
    savedPath = path.join(outputDir, `${path.basename(outputName, '.jpg')}-${Date.now()}.jpg`);
    await fs.writeFile(savedPath, final);
  });

  const stat = await fs.stat(savedPath);
  const meta = await sharp(savedPath).metadata();

  return {
    filename: path.basename(savedPath),
    local_path: savedPath,
    byte_size: stat.size,
    mime_type: mimeFromExt(savedPath),
    width: meta.width ?? null,
    height: meta.height ?? null,
    source_asset_ids: files.map((f) => f.asset_id).filter(Boolean),
    processing_kind: mode,
    provider: 'local_worker',
    profile,
    metadata: {
      process_task_item_id: item.id ?? null,
      group_id: item.group_id ?? null,
      source_filenames: files.map((f) => f.filename),
    },
  };
}

export async function handleProcessPhotos(task) {
  if (!config.outputRoot) {
    return {
      task_id: task.id,
      status: 'failed',
      error: 'WORKER_OUTPUT_ROOT is required for process_photos',
    };
  }

  const items = task.payload?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    return { task_id: task.id, status: 'failed', error: 'items missing from payload' };
  }

  const profile = task.payload?.profile ?? 'natural';
  const processed_assets = [];
  const failed = [];

  for (const item of items) {
    try {
      processed_assets.push(await processItem(item, task.job_id, profile));
    } catch (e) {
      failed.push({
        item_id: item.id ?? item.group_id ?? item.files?.[0]?.asset_id ?? null,
        error: e?.message ?? String(e),
      });
    }
  }

  return {
    task_id: task.id,
    status: processed_assets.length > 0 ? 'completed' : 'failed',
    error: processed_assets.length > 0 ? undefined : failed[0]?.error ?? 'no_outputs',
    result: {
      processed: processed_assets.length,
      failed: failed.length,
      profile,
    },
    processed_assets,
    failed,
  };
}
