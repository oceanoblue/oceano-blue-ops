import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";

it("resolves Next ESLint project globs with the patched glob dependency", () => {
  const pluginRequire = createRequire(
    createRequire(import.meta.url).resolve("@next/eslint-plugin-next"),
  );
  const { getRootDirs } = pluginRequire("./utils/get-root-dirs.js");
  const root = mkdtempSync(join(tmpdir(), "ops-next-eslint-"));
  try {
    mkdirSync(join(root, "apps", "one"), { recursive: true });
    mkdirSync(join(root, "apps", "two"));
    writeFileSync(join(root, "apps", "file.txt"), "not a project directory");
    expect(getRootDirs({ cwd: root, settings: {} })).toEqual([root]);
    expect(
      getRootDirs({
        cwd: root,
        settings: { next: { rootDir: join(root, "apps", "*") } },
      }).map((dir: string) => resolve(dir)).sort(),
    ).toEqual([join(root, "apps", "one"), join(root, "apps", "two")]);
    expect(
      getRootDirs({
        cwd: root,
        settings: {
          next: {
            rootDir: [join(root, "apps", "one"), join(root, "apps", "two")],
          },
        },
      }),
    ).toHaveLength(2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
