// Pack loading and validation. A pack is the unit of comparison: a fixed dataset
// plus its scoring rules and a version. Results are only comparable within one
// pack version. Pure and dependency-free so it can be unit-tested.

import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

/** The check kinds a scoring expectation may use. Kept small on purpose. */
export const CHECK_KINDS = ["must_include", "must_not_include", "regex", "json_field", "contains_all"];

/** A pack manifest, as written in packs/<name>/manifest.json. */
export function validateManifest(raw, at = "manifest.json") {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: [`${at}: manifest must be an object`] };
  if (typeof raw.name !== "string" || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(raw.name)) errors.push(`${at}: "name" must be a lowercase slug`);
  if (typeof raw.version !== "string" || !/^v\d+$/.test(raw.version)) errors.push(`${at}: "version" must look like "v1"`);
  if (typeof raw.title !== "string" || !raw.title.trim()) errors.push(`${at}: "title" is required`);
  if (typeof raw.description !== "string" || !raw.description.trim()) errors.push(`${at}: "description" is required`);
  if (typeof raw.dataset !== "string" || !raw.dataset.trim()) errors.push(`${at}: "dataset" must be a file name`);
  if (raw.scoring !== undefined && !["all_checks", "any_check"].includes(raw.scoring)) errors.push(`${at}: "scoring" must be "all_checks" or "any_check"`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      name: raw.name,
      version: raw.version,
      title: raw.title.trim(),
      description: raw.description.trim(),
      dataset: raw.dataset.trim(),
      scoring: raw.scoring ?? "all_checks",
    },
  };
}

function validateCheck(check, where, errors) {
  if (!check || typeof check !== "object" || Array.isArray(check)) { errors.push(`${where}: a check must be an object`); return; }
  if (!CHECK_KINDS.includes(check.kind)) { errors.push(`${where}: unknown check kind "${check.kind}"`); return; }
  if (check.kind === "contains_all") {
    if (!Array.isArray(check.values) || !check.values.length || check.values.some((value) => typeof value !== "string")) errors.push(`${where}: contains_all needs a non-empty "values" array of strings`);
    return;
  }
  if (check.kind === "json_field") {
    if (typeof check.path !== "string" || !check.path.trim()) errors.push(`${where}: json_field needs a "path"`);
    if (check.equals === undefined && check.matches === undefined) errors.push(`${where}: json_field needs "equals" or "matches"`);
    return;
  }
  if (typeof check.value !== "string") errors.push(`${where}: ${check.kind} needs a string "value"`);
}

/** Validate one dataset item. Returns an error list (may be empty). */
export function validateItem(raw, where) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [`${where}: an item must be an object`];
  if (typeof raw.id !== "string" || !raw.id.trim()) errors.push(`${where}: "id" is required`);
  if (typeof raw.input !== "string" || !raw.input.trim()) errors.push(`${where}: "input" is required`);
  if (raw.system !== undefined && typeof raw.system !== "string") errors.push(`${where}: "system" must be a string when present`);
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.some((tag) => typeof tag !== "string"))) errors.push(`${where}: "tags" must be an array of strings when present`);
  if (!Array.isArray(raw.expect) || !raw.expect.length) errors.push(`${where}: "expect" must be a non-empty array of checks`);
  else raw.expect.forEach((check, index) => validateCheck(check, `${where} expect[${index}]`, errors));
  return errors;
}

/** Parse a JSONL dataset (one JSON object per non-empty line). */
export function parseDatasetJsonl(text, at = "dataset.jsonl") {
  const errors = [];
  const items = [];
  const seen = new Set();
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch { errors.push(`${at}:${index + 1}: invalid JSON`); return; }
    const itemErrors = validateItem(parsed, `${at}:${index + 1}`);
    if (itemErrors.length) { errors.push(...itemErrors); return; }
    if (seen.has(parsed.id)) { errors.push(`${at}:${index + 1}: duplicate item id "${parsed.id}"`); return; }
    seen.add(parsed.id);
    items.push({ id: parsed.id, input: parsed.input, system: parsed.system ?? null, tags: parsed.tags ?? [], expect: parsed.expect });
  });
  if (!items.length && !errors.length) errors.push(`${at}: dataset is empty`);
  return { errors, items };
}

/** Load a pack directory: manifest + dataset, fully validated. */
export function loadPack(packDir) {
  const manifestPath = join(packDir, "manifest.json");
  let manifestRaw;
  try { manifestRaw = JSON.parse(readFileSync(manifestPath, "utf8")); } catch (error) { return { ok: false, errors: [`${manifestPath}: ${error.message}`] }; }
  const manifestResult = validateManifest(manifestRaw, "manifest.json");
  if (!manifestResult.ok) return { ok: false, errors: manifestResult.errors };
  const manifest = manifestResult.manifest;
  const datasetPath = join(dirname(manifestPath), manifest.dataset);
  let datasetText;
  try { datasetText = readFileSync(datasetPath, "utf8"); } catch (error) { return { ok: false, errors: [`${datasetPath}: ${error.message}`] }; }
  const dataset = parseDatasetJsonl(datasetText, manifest.dataset);
  if (dataset.errors.length) return { ok: false, errors: dataset.errors };
  return { ok: true, pack: { dir: resolve(packDir), manifest, items: dataset.items } };
}
