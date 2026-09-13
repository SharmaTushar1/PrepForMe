// Three separate Vite builds, one per script, all landing in dist/.
//
// A normal single Vite build can't do this: MV3 content scripts are injected
// as classic (non-module) scripts, so they can't use `import`/`export` —
// everything they need has to be inlined into one IIFE file. The background
// service worker is declared `"type": "module"` in the manifest, so it can
// stay ESM. Rather than fight Rollup's multi-entry chunk-splitting to get
// that mix out of one build, each entry gets its own build call with the
// output format it actually needs.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes("--watch");

// Clean dist once before building, not per-target in watch mode.
const distPath = path.join(root, "dist");
if (!watch && fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true, force: true });
}

const targets = [
  {
    entry: "src/background/index.ts",
    fileName: "background.js",
    format: "es",
    emptyOutDir: watch ? false : true,
  },
  {
    entry: "src/content/bridge.ts",
    fileName: "content-bridge.js",
    format: "iife",
    emptyOutDir: false,
  },
  {
    entry: "src/content/panel.tsx",
    fileName: "content-panel.js",
    format: "iife",
    emptyOutDir: false,
  },
  {
    entry: "src/content/frame-autofill.ts",
    fileName: "content-frame-autofill.js",
    format: "iife",
    emptyOutDir: false,
  },
  {
    entry: "src/pdf-viewer.ts",
    fileName: "pdf-viewer.js",
    format: "iife",
    emptyOutDir: false,
  },
];

for (const target of targets) {
  console.log(`Building ${target.entry} -> dist/${target.fileName}`);
  await build({
    root,
    configFile: false,
    envDir: root,
    mode: "production",
    plugins: [react()],
    build: {
      outDir: "dist",
      emptyOutDir: target.emptyOutDir,
      minify: true,
      sourcemap: false,
      watch: watch ? {} : null,
      rollupOptions: {
        input: path.join(root, target.entry),
        output: {
          format: target.format,
          entryFileNames: target.fileName,
          inlineDynamicImports: true,
        },
      },
    },
  });
}

// Vite copies public/ into dist/ on every one of the three builds above —
// harmless (same files each time), just confirming it landed since the
// manifest and icons are what actually make this loadable as an extension.
const manifestOut = path.join(root, "dist", "manifest.json");
if (!fs.existsSync(manifestOut)) {
  throw new Error(
    "dist/manifest.json is missing — expected Vite to copy it from public/.",
  );
}
console.log("Done. Load extension/dist/ as an unpacked extension in Chrome.");
