#!/usr/bin/env node
// evalkit CLI. Three commands: list packs, validate a pack, run a pack.

import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "../src/pack.mjs";
import { parseRunArgs } from "../src/config.mjs";
import { runPack } from "../src/run.mjs";
import { toMarkdown } from "../src/report.mjs";
import { serveRuns } from "../src/serve.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = resolve(here, "..", "packs");

function usage() {
  return `evalkit — score a local model on a fixed pack

Usage:
  evalkit list
  evalkit validate <pack-dir>
  evalkit run <pack-dir> --model <name> [options]
  evalkit view [--port <n>]

Options:
  --base-url <url>     OpenAI-compatible base URL (default http://127.0.0.1:8080/v1)
  --model <name>       model name to send (required)
  --api-key <key>      bearer token (default: "not-needed")
  --temperature <n>    sampling temperature (default 0)
  --max-tokens <n>     max tokens per answer (default 1024)
  --timeout-ms <n>     per-call timeout (default 120000)
  --hardware <text>    free-text hardware note recorded in the report
  --quant <text>       declared quantization (e.g. Q4_K_M), recorded not inferred
  --context <text>     declared context window (e.g. 32768), recorded not inferred
  --kv <text>          declared KV cache type (e.g. q8_0), recorded not inferred
  --stream             stream the response to measure TTFT (default)
  --no-stream          single response; TTFT is not measurable
  --json               print the JSON report instead of Markdown

The run is written to ./evalkit-runs/<pack>-<timestamp>.json and .md.
Nothing is uploaded: results stay on your machine until you choose to share them.
`;
}

function listPacks() {
  let names = [];
  try { names = readdirSync(PACKS_DIR).filter((name) => statSync(join(PACKS_DIR, name)).isDirectory()); } catch { names = []; }
  if (!names.length) { console.log("No packs found."); return 0; }
  console.log("Packs:");
  for (const name of names) {
    const result = loadPack(join(PACKS_DIR, name));
    if (result.ok) console.log(`  ${result.pack.manifest.name} ${result.pack.manifest.version} — ${result.pack.manifest.title} (${result.pack.items.length} items)`);
    else console.log(`  ${name} — INVALID: ${result.errors[0]}`);
  }
  return 0;
}

function validate(path) {
  const result = loadPack(resolve(path));
  if (!result.ok) { console.error(`Invalid pack:\n  ${result.errors.join("\n  ")}`); return 1; }
  console.log(`OK: ${result.pack.manifest.name} ${result.pack.manifest.version}, ${result.pack.items.length} items.`);
  return 0;
}

async function run(argv) {
  const { errors, options, packDir } = parseRunArgs(argv);
  if (errors.length) { console.error(`Argument error:\n  ${errors.join("\n  ")}`); return 2; }
  // Record the exact command, so a report can be reproduced without guessing.
  options.command = `evalkit ${process.argv.slice(2).join(" ")}`;
  const loaded = loadPack(resolve(packDir));
  if (!loaded.ok) { console.error(`Invalid pack:\n  ${loaded.errors.join("\n  ")}`); return 1; }
  const pack = loaded.pack;
  console.log(`Running ${pack.manifest.name} ${pack.manifest.version} (${pack.items.length} items) against ${options.model} at ${options.baseUrl}…`);
  const report = await runPack(pack, options);
  const outDir = resolve(process.cwd(), "evalkit-runs");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stem = join(outDir, `${pack.manifest.name}-${stamp}`);
  writeFileSync(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${stem}.md`, toMarkdown(report));
  console.log(`\n${report.summary.passed}/${report.summary.total} passed.`);
  console.log(`Reports: ${stem}.json and ${stem}.md`);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  return 0;
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "help" || command === "--help" || command === "-h") { console.log(usage()); process.exit(0); }
if (command === "list") process.exit(listPacks());
if (command === "validate") { if (!rest[0]) { console.error("validate needs a pack directory"); process.exit(2); } process.exit(validate(rest[0])); }
if (command === "run") process.exit(await run(rest));
if (command === "view") {
  const portFlag = rest.indexOf("--port");
  const port = portFlag >= 0 ? Number(rest[portFlag + 1]) : 4173;
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error("--port must be a valid port number"); process.exit(2); }
  const runsDir = resolve(process.cwd(), "evalkit-runs");
  serveRuns({ runsDir, port });
  console.log(`evalkit view on http://127.0.0.1:${port} (reading ${runsDir})`);
  console.log("Local only. Press Ctrl+C to stop.");
  await new Promise(() => {});
}
console.error(`Unknown command "${command}".\n\n${usage()}`);
process.exit(2);
