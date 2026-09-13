#!/usr/bin/env node
/**
 * Nitro traces `@electric-sql/pglite` into `__server.func/_libs` but not the
 * sibling wasm/data files PGLite reads from disk. Copy them next to the bundle
 * so `vite preview` of the Vercel output can boot the PGLite fallback.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules/@electric-sql/pglite/dist");
const destDir = join(root, ".vercel/output/functions/__server.func/_libs");
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

if (!existsSync(join(srcDir, "pglite.data"))) process.exit(0);
mkdirSync(destDir, { recursive: true });
for (const name of files) {
  const from = join(srcDir, name);
  if (!existsSync(from)) continue;
  copyFileSync(from, join(destDir, name));
}
