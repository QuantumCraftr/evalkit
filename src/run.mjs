// Orchestration: run every item in a pack against one endpoint, score it, and
// return a report. Sequential on purpose: local servers answer one request at a
// time, so parallel calls would measure contention, not the model.

import { callModel } from "./client.mjs";
import { scoreItem } from "./score.mjs";
import { buildReport } from "./report.mjs";

export async function runPack(pack, options, fetchImpl = fetch) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const scored = [];
  const errors = [];
  const latencies = [];
  const meters = [];
  for (const item of pack.items) {
    const result = await callModel({ baseUrl: options.baseUrl, model: options.model, input: item.input, system: item.system, apiKey: options.apiKey, maxTokens: options.maxTokens, temperature: options.temperature, timeoutMs: options.timeoutMs, stream: options.stream }, fetchImpl);
    if (!result.ok) {
      errors.push({ id: item.id, error: result.error });
      // A failed call is a failed item with a clear reason, not a silent skip.
      scored.push({ id: item.id, tags: item.tags ?? [], passed: false, checks: [{ kind: "call", passed: false, detail: result.error }] });
      continue;
    }
    if (result.meter.elapsedMs) latencies.push(result.meter.elapsedMs);
    meters.push(result.meter);
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
      wallClockMs: Date.now() - startedMs,
      settings: {
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        timeoutMs: options.timeoutMs,
        streamed: options.stream !== false,
        // Declared by the user, never inferred: the harness cannot see the
        // server's quantization or KV setup from an API call.
        quant: options.quant ?? null,
        context: options.context ?? null,
        kv: options.kv ?? null,
      },
      command: options.command ?? null,
      performance: performanceOf(meters),
    },
    scored,
  });
  return report;
}

/** Aggregate the per-item meters. Medians, not means: a single slow call must not skew the picture. */
export function performanceOf(meters) {
  const latencies = meters.map((m) => m.elapsedMs).filter((value) => typeof value === "number" && value > 0);
  const speeds = meters.map((m) => m.tokensPerSecond).filter((value) => typeof value === "number" && value > 0);
  const ttfts = meters.map((m) => m.ttftMs).filter((value) => typeof value === "number" && value > 0);
  const effective = meters.map((m) => m.effectiveTokensPerSecond).filter((value) => typeof value === "number" && value > 0);
  const completion = meters.map((m) => m.completionTokens).filter((value) => typeof value === "number");
  const prompt = meters.map((m) => m.promptTokens).filter((value) => typeof value === "number");
  return {
    calls: meters.length,
    streamed: meters.some((m) => m.streamed),
    medianLatencyMs: median(latencies),
    maxLatencyMs: latencies.length ? Math.max(...latencies) : null,
    minLatencyMs: latencies.length ? Math.min(...latencies) : null,
    medianTtftMs: median(ttfts),
    medianTokensPerSecond: median(speeds),
    medianEffectiveTokensPerSecond: median(effective),
    totalCompletionTokens: completion.reduce((sum, value) => sum + value, 0) || null,
    medianCompletionTokens: median(completion),
    medianPromptTokens: median(prompt),
    metered: meters.some((m) => m.completionTokens !== null),
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
