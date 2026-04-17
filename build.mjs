// build.mjs — bundles src/index.ts into a single self-contained bin/lpad.js
import { build } from "esbuild";
import { chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(__dirname, "bin/lpad.js");

await build({
  entryPoints: [resolve(__dirname, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  banner: { js: "#!/usr/bin/env node" },
  minify: false,
  sourcemap: false,
});

await chmod(outfile, 0o755);
console.log(`Built ${outfile}`);
