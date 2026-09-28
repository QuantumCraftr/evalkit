// Report rendering: a JSON record for machines and a Markdown summary for humans.
// The caveats are part of every report on purpose: a number without its limits is
// a claim, not a measurement.

import { summarize } from "./score.mjs";

const CAVEATS = [
  "One run per item. Small differences are noise; repeat before claiming a change.",
  "This compares setups (model + quant + runtime + settings), not models in isolation.",
  "Temperature is 0 for reproducibility; sampling differences are out of scope here.",
  "A pass means the checks passed, not that the answer is good. The failures are the signal.",
];

/** Build the full run record from scored items and run metadata. */
export function buildReport({ pack, meta, scored }) {
  return {
    pack: { name: pack.manifest.name, version: pack.manifest.version, title: pack.manifest.title },
    meta,
    summary: summarize(scored),
    items: scored,
    caveats: CAVEATS,
  };
}

function percent(value) {
  return `${Math.round(value * 1000) / 10}%`;
}

/** Render a report to Markdown for a README, a PR comment or a paste. */
export function toMarkdown(report) {
  const { pack, meta, summary } = report;
  const lines = [];
  lines.push(`# ${pack.title} — ${pack.name} ${pack.version}`);
  lines.push("");
  lines.push(`**Model:** \`${meta.model}\`  `);
  lines.push(`**Endpoint:** \`${meta.baseUrl}\`  `);
  lines.push(`**Run:** ${meta.startedAt}  `);
  if (meta.hardware) lines.push(`**Hardware:** ${meta.hardware}  `);
  const settings = meta.settings;
  if (settings) lines.push(`**Settings:** temperature ${settings.temperature}, max tokens ${settings.maxTokens}, timeout ${settings.timeoutMs}ms  `);
  if (settings?.quant) lines.push(`**Declared quant:** ${settings.quant}  `);
  if (settings?.context) lines.push(`**Declared context:** ${settings.context}  `);
  if (settings?.kv) lines.push(`**Declared KV cache:** ${settings.kv}  `);
  if (meta.command) { lines.push(""); lines.push("```sh"); lines.push(meta.command); lines.push("```"); }
  lines.push("");
  lines.push(`## Result`);
  lines.push("");
  lines.push(`**${summary.passed}/${summary.total} passed (${percent(summary.passRate)})**`);
  lines.push("");
  if (summary.byTag.length) {
    lines.push(`| Group | Passed | Total | Rate |`);
    lines.push(`|---|---|---|---|`);
    for (const row of summary.byTag) lines.push(`| ${row.tag} | ${row.passed} | ${row.total} | ${percent(row.total ? row.passed / row.total : 0)} |`);
    lines.push("");
  }
  if (summary.byCheck.length) {
    lines.push(`| Check | Passed | Total |`);
    lines.push(`|---|---|---|`);
    for (const row of summary.byCheck) lines.push(`| ${row.kind} | ${row.passed} | ${row.total} |`);
    lines.push("");
  }
  const perf = meta.performance;
  if (perf && perf.calls) {
    lines.push(`## Performance`);
    lines.push("");
    lines.push(`Measured client-side, one call per item, sequential.`);
    lines.push("");
    lines.push(`| Metric | Value |`);
    lines.push(`|---|---|`);
    lines.push(`| Calls | ${perf.calls} |`);
    if (perf.medianLatencyMs != null) lines.push(`| Median total latency | ${perf.medianLatencyMs} ms |`);
    if (perf.minLatencyMs != null && perf.maxLatencyMs != null) lines.push(`| Latency range | ${perf.minLatencyMs}–${perf.maxLatencyMs} ms |`);
    if (perf.medianTtftMs != null) lines.push(`| Median time to first token | ${perf.medianTtftMs} ms |`);
    if (perf.medianTokensPerSecond != null) lines.push(`| Median decode rate | ${perf.medianTokensPerSecond} tok/s |`);
    if (perf.medianEffectiveTokensPerSecond != null) lines.push(`| Median effective rate | ${perf.medianEffectiveTokensPerSecond} tok/s (completion / total time) |`);
    if (perf.totalCompletionTokens != null) lines.push(`| Completion tokens | ${perf.totalCompletionTokens} (median ${perf.medianCompletionTokens}/item) |`);
    if (perf.medianPromptTokens != null) lines.push(`| Median prompt tokens | ${perf.medianPromptTokens} |`);
    if (!perf.metered) lines.push(`| Token counts | not reported by this backend (rates are a lower bound) |`);
    lines.push("");
    if (!perf.streamed) lines.push(`Without streaming, TTFT cannot be separated from decode; only total latency is reported.`);
    lines.push("");
  }
  if (summary.failures.length) {
    lines.push(`## Failures`);
    lines.push("");
    for (const failure of summary.failures) {
      lines.push(`- **${failure.id}**${failure.tags.length ? ` (${failure.tags.join(", ")})` : ""}`);
      for (const check of failure.failedChecks) lines.push(`  - ${check.kind}: ${check.detail}`);
    }
    lines.push("");
  }
  lines.push(`## Caveats`);
  lines.push("");
  for (const caveat of report.caveats) lines.push(`- ${caveat}`);
  lines.push("");
  return lines.join("\n");
}
