'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Film,
  Upload,
  X,
  Loader2,
  Check,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { tusUpload, RESUMABLE_THRESHOLD_BYTES } from '@/lib/storage/tus-upload';
import {
  ASPECTS,
  REEL_TYPES,
  EMPTY_BRIEF,
  ACCEPTED_FOOTAGE_MIME,
  MAX_FOOTAGE_BYTES,
  type ReelBrief,
} from '@/lib/reels/types';
import type { Json } from '@/lib/supabase/database.types';
import { cn } from '@/lib/utils/cn';

interface FootageItem {
  id: string;
  file: File;
  role: string;
  notes: string;
  progress: number; // 0..1
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}

const STEPS = ['Format', 'Details', 'Footage', 'Brief'];

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, '_').slice(-120);
}

export function ReelIntakeWizard({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState<ReelBrief>(EMPTY_BRIEF);
  const [footage, setFootage] = useState<FootageItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const set = <K extends keyof ReelBrief>(k: K, v: ReelBrief[K]) =>
    setBrief((b) => ({ ...b, [k]: v }));

  const addFiles = useCallback((files: FileList | File[]) => {
    setError(null);
    const next: FootageItem[] = [];
    for (const file of Array.from(files)) {
      const okType =
        ACCEPTED_FOOTAGE_MIME.includes(file.type) || file.type.startsWith('video/');
      if (!okType) {
        setError(`"${file.name}" isn't a supported video format (MP4, MOV, M4V, WebM).`);
        continue;
      }
      if (file.size > MAX_FOOTAGE_BYTES) {
        setError(`"${file.name}" is larger than the 2 GB per-file limit.`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        role: '',
        notes: '',
        progress: 0,
        status: 'queued',
      });
    }
    if (next.length) setFootage((f) => [...f, ...next]);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFootage = (id: string) =>
    setFootage((f) => f.filter((x) => x.id !== id));

  const patchFootage = (id: string, patch: Partial<FootageItem>) =>
    setFootage((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const canNext = useMemo(() => {
    if (step === 0) return !!brief.reel_type && !!brief.aspect;
    if (step === 2) return footage.length > 0;
    return true;
  }, [step, brief, footage]);

  async function submit() {
    if (footage.length === 0) {
      setError('Add at least one footage clip before submitting.');
      setStep(2);
      return;
    }
    setSubmitting(true);
    setError(null);
    const supabase = createClient();

    try {
      // 1. Create the draft reel order + brief (server re-derives client_id).
      const briefJson: Json = {
        reel_type: brief.reel_type,
        aspect: brief.aspect,
        length_target_s: brief.length_target_s === '' ? null : brief.length_target_s,
        captions: brief.captions,
        music: brief.music,
        lower_third: brief.lower_third,
        subject_name: brief.subject_name,
        subject_title: brief.subject_title,
        brand_kit: brief.brand_kit as Json,
        must_include: brief.must_include,
        must_avoid: brief.must_avoid,
        about: brief.about,
      };
      const { data: orderId, error: createErr } = await supabase.rpc('create_reel_order', {
        p_brief: briefJson,
      });
      if (createErr || !orderId) throw new Error(createErr?.message ?? 'Could not create the order.');

      // 2. Upload each clip into the client's own prefix, then register it.
      for (const item of footage) {
        patchFootage(item.id, { status: 'uploading', progress: 0, error: undefined });
        const objectName = `${clientId}/${orderId}/${crypto.randomUUID()}-${safeName(item.file.name)}`;
        const contentType = item.file.type || 'video/mp4';

        try {
          if (item.file.size > RESUMABLE_THRESHOLD_BYTES) {
            await tusUpload({
              file: item.file,
              bucket: 'client-footage',
              objectName,
              contentType,
              onProgress: (sent, total) =>
                patchFootage(item.id, { progress: total ? sent / total : 0 }),
            });
          } else {
            const { error: upErr } = await supabase.storage
              .from('client-footage')
              .upload(objectName, item.file, { contentType, upsert: false });
            if (upErr) throw upErr;
            patchFootage(item.id, { progress: 1 });
          }

          const { error: regErr } = await supabase.rpc('add_reel_footage', {
            p_order_id: orderId,
            p_storage_path: objectName,
            p_filename: item.file.name,
            p_mime_type: contentType,
            p_byte_size: item.file.size,
            p_role: item.role || undefined,
            p_notes: item.notes || undefined,
          });
          if (regErr) throw regErr;
          patchFootage(item.id, { status: 'done', progress: 1 });
        } catch (e) {
          patchFootage(item.id, {
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          });
          throw new Error(`Upload failed for "${item.file.name}". Nothing was submitted.`);
        }
      }

      // 3. Hand the order to the team.
      const { error: subErr } = await supabase.rpc('submit_reel_order', { p_order_id: orderId });
      if (subErr) throw new Error(subErr.message);

      router.push('/portal/reels?submitted=1');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium',
                i < step && 'bg-ocean-700 text-white',
                i === step && 'bg-ocean-700 text-white ring-2 ring-ocean-200',
                i > step && 'bg-slate-200 text-slate-500'
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('text-sm', i === step ? 'font-medium text-ocean-900' : 'text-slate-500')}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-slate-200" />}
          </li>
        ))}
      </ol>

      {/* ── Step 0: format ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <label className="label">Reel type</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {REEL_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => set('reel_type', t.value)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition',
                    brief.reel_type === t.value
                      ? 'border-ocean-500 bg-ocean-50 ring-1 ring-ocean-500'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="font-medium text-ocean-950">{t.label}</div>
                  <div className="text-xs text-slate-500">{t.blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Aspect ratio</label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {ASPECTS.map((a) => (
                <button
                  key={a.value}
                  onClick={() => set('aspect', a.value)}
                  className={cn(
                    'rounded-xl border p-3 text-left transition',
                    brief.aspect === a.value
                      ? 'border-ocean-500 bg-ocean-50 ring-1 ring-ocean-500'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="text-sm font-medium text-ocean-950">{a.label}</div>
                  <div className="text-[11px] text-slate-500">{a.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Target length (seconds, optional)</label>
            <input
              className="input mt-1 max-w-[180px]"
              type="number"
              min={5}
              max={600}
              placeholder="e.g. 60"
              value={brief.length_target_s}
              onChange={(e) =>
                set('length_target_s', e.target.value === '' ? '' : Number(e.target.value))
              }
            />
          </div>
        </div>
      )}

      {/* ── Step 1: details ────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Subject name</label>
              <input
                className="input mt-1"
                placeholder="Andrew Parker"
                value={brief.subject_name}
                onChange={(e) => set('subject_name', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Subject title</label>
              <input
                className="input mt-1"
                placeholder="Charleston Realtor"
                value={brief.subject_title}
                onChange={(e) => set('subject_title', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Include</label>
            <div className="mt-2 space-y-2">
              <Toggle
                label="Captions / subtitles"
                checked={brief.captions}
                onChange={(v) => set('captions', v)}
              />
              <Toggle
                label="Background music"
                checked={brief.music}
                onChange={(v) => set('music', v)}
              />
              <Toggle
                label="Name lower-third"
                checked={brief.lower_third}
                onChange={(v) => set('lower_third', v)}
              />
            </div>
          </div>

          <div>
            <label className="label">Brand colors (optional)</label>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {(['primary', 'secondary', 'accent'] as const).map((k) => (
                <div key={k}>
                  <div className="mb-1 text-xs capitalize text-slate-500">{k}</div>
                  <input
                    className="input"
                    placeholder="#243d28"
                    value={brief.brand_kit[k] ?? ''}
                    onChange={(e) =>
                      set('brand_kit', { ...brief.brand_kit, [k]: e.target.value })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2: footage ────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={cn(
              'rounded-2xl border-2 border-dashed p-8 text-center transition',
              dragActive ? 'border-ocean-500 bg-ocean-50' : 'border-slate-300 bg-slate-50'
            )}
          >
            <Upload className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-2 text-sm text-slate-600">
              Drag &amp; drop your clips, or{' '}
              <button
                className="font-medium text-ocean-700 hover:underline"
                onClick={() => fileInput.current?.click()}
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-xs text-slate-400">MP4, MOV, M4V, WebM · up to 2 GB each</p>
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              multiple
              hidden
              onChange={(e) => e.target.files && addFiles(e.target.files)}
            />
          </div>

          {footage.length > 0 && (
            <ul className="space-y-2">
              {footage.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-3">
                    <Film className="h-5 w-5 shrink-0 text-ocean-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ocean-950">
                        {item.file.name}
                      </div>
                      <div className="text-xs text-slate-500">{fmtBytes(item.file.size)}</div>
                    </div>
                    {item.status === 'uploading' && (
                      <span className="text-xs text-slate-500">
                        {Math.round(item.progress * 100)}%
                      </span>
                    )}
                    {item.status === 'done' && <Check className="h-4 w-4 text-emerald-600" />}
                    {item.status === 'error' && <AlertCircle className="h-4 w-4 text-rose-600" />}
                    {!submitting && (
                      <button
                        onClick={() => removeFootage(item.id)}
                        className="text-slate-400 hover:text-rose-600"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {item.status === 'uploading' && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-ocean-600 transition-all"
                        style={{ width: `${Math.round(item.progress * 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-[160px_1fr]">
                    <input
                      className="input text-sm"
                      placeholder="Role (e.g. intro, b-roll)"
                      value={item.role}
                      onChange={(e) => patchFootage(item.id, { role: e.target.value })}
                      disabled={submitting}
                    />
                    <input
                      className="input text-sm"
                      placeholder="Notes for the editor (optional)"
                      value={item.notes}
                      onChange={(e) => patchFootage(item.id, { notes: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Step 3: brief ──────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <label className="label">What is this reel about?</label>
            <textarea
              className="input mt-1 min-h-[90px]"
              placeholder="The story, the vibe, the goal…"
              value={brief.about}
              onChange={(e) => set('about', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Must include</label>
            <textarea
              className="input mt-1 min-h-[70px]"
              placeholder="Specific lines, shots, branding, a call-to-action…"
              value={brief.must_include}
              onChange={(e) => set('must_include', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Must avoid</label>
            <textarea
              className="input mt-1 min-h-[70px]"
              placeholder="Anything to keep out — bloopers, certain takes, music styles…"
              value={brief.must_avoid}
              onChange={(e) => set('must_avoid', e.target.value)}
            />
          </div>

          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-medium text-ocean-950">Ready to submit</div>
            <p className="mt-1">
              {footage.length} clip{footage.length === 1 ? '' : 's'} ·{' '}
              {REEL_TYPES.find((t) => t.value === brief.reel_type)?.label} ·{' '}
              {ASPECTS.find((a) => a.value === brief.aspect)?.label}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || submitting}
          className="btn-ghost inline-flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => canNext && setStep((s) => s + 1)}
            disabled={!canNext}
            className="btn-primary inline-flex items-center gap-1 disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {submitting ? 'Uploading…' : 'Submit reel order'}
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-300"
    >
      <span className="text-slate-700">{label}</span>
      <span
        className={cn(
          'relative h-5 w-9 rounded-full transition',
          checked ? 'bg-ocean-600' : 'bg-slate-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}
