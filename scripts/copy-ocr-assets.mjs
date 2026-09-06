// Copies the in-browser OCR runtime (tesseract.js worker + LSTM wasm cores +
// English traineddata) from node_modules into public/tesseract/ so the app can
// run screenshot -> text extraction fully offline (no CDN at runtime).
// Run automatically before `npm run dev` (dev.mjs) and before `vite build`.
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const from = join(root, "node_modules");
const to = join(root, "public", "tesseract");
mkdirSync(to, { recursive: true });

const files = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm", "tesseract-core-simd-lstm.wasm"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm", "tesseract-core-relaxedsimd-lstm.wasm"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"]
];

let copied = 0;
for (const [source, target] of files) {
  const src = join(from, source);
  if (!existsSync(src)) continue;
  cpSync(src, join(to, target));
  copied += 1;
}
console.log(`OCR assets: ${copied}/${files.length} files in public/tesseract/`);
