// Orchestration: run every item in a pack against one endpoint, score it, and
// return a report. Sequential on purpose: local servers answer one request at a
// time, so parallel calls would measure contention, not the model.

import { callModel } from "./client.mjs";
import { scoreItem } from "./score.mjs";
import { buildReport } from "./report.mjs";

export async function runPack(pack, options, fetchImpl = fetch) {
  const startedAt = new Date().toISOString();
  const scored = [];
  const errors = [];
  const latencies = [];
  for (const item of pack.items) {
    const result = await callModel({ baseUrl: options.baseUrl, model: options.model, input: item.input, system: item.system, apiKey: options.apiKey, maxTokens: options.maxTokens, temperature: options.temperature, timeoutMs: options.timeoutMs }, fetchImpl);
    if (!result.ok) {
      errors.push({ id: item.id, error: result.error });
      // A failed call is a failed item with a clear reason, not a silent skip.
      scored.push({ id: item.id, tags: item.tags ?? [], passed: false, checks: [{ kind: "call", passed: false, detail: result.error }] });
      continue;
    }
    if (result.meter.elapsedMs) latencies.push(result.meter.elapsedMs);
    scored.push({ ...scoreItem(item, result.output, pack.manifest.scoring), output: result.output, meter: result.meter });
  }
  const report = buildReport({
    pack,
    meta: {
      model: options.model,
      baseUrl: options.baseUrl,
      hardware: options.hardware ?? null,
      startedAt,
      items: pack.items.length,
      errors,
      medianLatencyMs: median(latencies),
    },
    scored,
  });
  return report;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
