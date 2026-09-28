import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadPack, parseDatasetJsonl, validateManifest } from "../src/pack.mjs";
import { parseRunArgs } from "../src/config.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("manifest validation rejects a bad slug and version", () => {
  const bad = validateManifest({ name: "Bad Name", version: "1", title: "t", description: "d", dataset: "d.jsonl" });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length >= 2, true);
});

test("manifest defaults scoring to all_checks", () => {
  const ok = validateManifest({ name: "pack-x", version: "v1", title: "T", description: "D", dataset: "dataset.jsonl" });
  assert.equal(ok.ok, true);
  assert.equal(ok.manifest.scoring, "all_checks");
});

test("dataset parsing catches invalid JSON, duplicate ids and empty input", () => {
  assert.match(parseDatasetJsonl('{"id":"a"').errors[0], /invalid JSON/);
  const dup = parseDatasetJsonl('{"id":"a","input":"i","expect":[{"kind":"must_include","value":"x"}]}\n{"id":"a","input":"i","expect":[{"kind":"must_include","value":"x"}]}');
  assert.match(dup.errors[0], /duplicate item id/);
  assert.match(parseDatasetJsonl("  \n").errors[0], /empty/);
});

test("the shipped receptionist pack loads and validates", () => {
  const result = loadPack(resolve(here, "..", "packs", "receptionist-v1"));
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join(", "));
  assert.equal(result.pack.manifest.name, "receptionist");
  assert.equal(result.pack.items.length, 8);
});

test("run args parse flags and require a model", () => {
  const ok = parseRunArgs(["packs/x", "--model", "qwen", "--temperature", "0.2", "--quant", "Q4_K_M", "--context", "32768", "--kv", "q8_0"]);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.options.model, "qwen");
  assert.equal(ok.options.temperature, 0.2);
  assert.equal(ok.options.quant, "Q4_K_M");
  assert.equal(ok.options.context, "32768");
  assert.equal(ok.options.kv, "q8_0");
  assert.equal(ok.options.stream, true);
  const missing = parseRunArgs(["packs/x"]);
  assert.match(missing.errors.join(" "), /--model is required/);
  const noPack = parseRunArgs(["--model", "qwen"]);
  assert.match(noPack.errors.join(" "), /pack directory/);
  const badFlag = parseRunArgs(["packs/x", "--model", "q", "--nope", "1"]);
  assert.match(badFlag.errors.join(" "), /unknown flag/);
  assert.equal(parseRunArgs(["packs/x", "--model", "q", "--no-stream"]).options.stream, false);
});
