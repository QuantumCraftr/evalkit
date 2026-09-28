// A tiny local viewer for run reports. No dependency, no build step: an HTTP
// server that reads evalkit-runs/*.json and renders them. Nothing leaves the
// machine; it binds to 127.0.0.1 only.

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { toMarkdown } from "./report.mjs";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const pct = (value) => `${Math.round((value ?? 0) * 1000) / 10}%`;

function listRuns(runsDir) {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try { return { file: name, report: JSON.parse(readFileSync(join(runsDir, name), "utf8")) }; }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.report.meta?.startedAt ?? "").localeCompare(a.report.meta?.startedAt ?? ""));
}

const CSS = `
:root{
  --bg:#0b0e0d; --panel:#121715; --panel-2:#161c19; --border:#242c28; --border-2:#2f3933;
  --fg:#e6ece6; --muted:#8b998d; --accent:#a6c96a; --accent-dim:#6f8f42;
  --pass:#a6c96a; --fail:#e08a74; --warn:#d8b25e;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code,pre,.mono{font-family:var(--mono)}
.shell{max-width:1040px;margin:0 auto;padding:0 24px}
.top{border-bottom:1px solid var(--border);background:linear-gradient(180deg,#0f1412,#0b0e0d)}
.top-in{display:flex;align-items:center;gap:14px;padding:16px 0}
.logo{display:flex;align-items:center;gap:9px;font-weight:600;letter-spacing:-.02em}
.logo .dot{width:9px;height:9px;border-radius:2px;background:var(--accent);box-shadow:0 0 0 3px rgba(166,201,106,.14)}
.top .tag{margin-left:auto;color:var(--muted);font:11px var(--mono);letter-spacing:.04em;text-transform:uppercase}
main{padding:34px 0 90px}
.crumb{font:12px var(--mono);color:var(--muted);margin-bottom:20px}
.crumb a{color:var(--muted)}.crumb a:hover{color:var(--accent)}
h1{font-size:30px;line-height:1.15;font-weight:600;letter-spacing:-.025em;margin:0 0 8px}
h2{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:36px 0 14px}
.lead{color:var(--muted);margin:0 0 8px;max-width:640px}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:999px;padding:4px 11px;font:12px var(--mono);color:var(--muted);background:var(--panel)}
.chip b{color:var(--fg);font-weight:500}
.empty{border:1px dashed var(--border-2);border-radius:12px;padding:28px;color:var(--muted);text-align:center}
.empty code{color:var(--fg);background:var(--panel);padding:2px 6px;border-radius:5px}

/* run cards */
.runs{display:grid;gap:12px}
.run-card{display:block;border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:18px 20px;transition:border-color .12s,transform .12s}
.run-card:hover{border-color:var(--border-2);transform:translateY(-1px);text-decoration:none}
.run-card .head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.run-card .title{font-size:17px;font-weight:600;color:var(--fg);letter-spacing:-.01em}
.run-card .sub{color:var(--muted);font:12px var(--mono);margin-top:6px;word-break:break-word}
.run-card .score{text-align:right;flex:none}
.run-card .score .n{font:22px var(--mono);font-weight:600;color:var(--pass)}
.run-card .score .n.low{color:var(--fail)}
.run-card .score .l{display:block;font:10px var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}
.bar{height:6px;border-radius:999px;background:#1c2320;margin-top:16px;overflow:hidden}
.bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent-dim),var(--accent))}
.bar i.low{background:linear-gradient(90deg,#7a4a3d,var(--fail))}

/* summary tiles */
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:6px}
.tile{border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:16px 18px}
.tile .k{font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.tile .v{font:26px var(--mono);font-weight:600;margin-top:8px;color:var(--fg)}
.tile .v.pass{color:var(--pass)}.tile .v.fail{color:var(--fail)}

/* tables */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px}
table{width:100%;border-collapse:collapse}
th{ text-align:left;font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:0 10px 8px 0;border-bottom:1px solid var(--border)}
td{padding:9px 10px 9px 0;border-bottom:1px solid var(--border);font-size:13.5px}
td.num,th.num{text-align:right;font-family:var(--mono)}
.track{display:inline-block;width:70px;height:5px;border-radius:999px;background:#1c2320;vertical-align:middle;overflow:hidden}
.track i{display:block;height:100%;background:var(--accent)}
.track i.low{background:var(--fail)}

/* items */
.items{display:grid;gap:8px}
.item{border:1px solid var(--border);border-radius:11px;background:var(--panel);overflow:hidden}
.item.pass{border-left:3px solid var(--pass)}
.item.fail{border-left:3px solid var(--fail)}
.item summary{display:flex;align-items:center;gap:12px;padding:13px 16px;cursor:pointer;list-style:none}
.item summary::-webkit-details-marker{display:none}
.item summary .mark{font:13px var(--mono);width:18px;flex:none;text-align:center}
.item.pass .mark{color:var(--pass)}.item.fail .mark{color:var(--fail)}
.item summary .id{font:13px var(--mono);color:var(--fg)}
.item summary .tags{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.tag-pill{border:1px solid var(--border);border-radius:999px;padding:1px 9px;font:10.5px var(--mono);color:var(--muted)}
.chev{color:var(--muted);flex:none;transition:transform .15s}
.item[open] .chev{transform:rotate(90deg)}
.detail{padding:4px 16px 16px;border-top:1px solid var(--border)}
.checks{display:grid;gap:6px;margin-top:12px}
.check{display:flex;gap:10px;align-items:baseline;font-size:13px}
.check .cm{font:12px var(--mono);flex:none;width:52px}
.check .cm.pass{color:var(--pass)}.check .cm.fail{color:var(--fail)}
.check .kind{font:12px var(--mono);color:var(--muted);flex:none;width:130px}
.check .detail-t{color:#c3ccc4}
.out-label{font:11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 6px}
pre.out{margin:0;background:#090c0b;border:1px solid var(--border);border-radius:9px;padding:14px;overflow:auto;font-size:12.5px;line-height:1.6;color:#c3ccc4;white-space:pre-wrap;word-break:break-word}
details.md{margin-top:12px;border:1px solid var(--border);border-radius:11px;background:var(--panel)}
details.md summary{padding:13px 16px;cursor:pointer;font:12px var(--mono);color:var(--muted)}
details.md pre{margin:0;border:0;border-top:1px solid var(--border);border-radius:0}
.foot{margin-top:60px;padding-top:24px;border-top:1px solid var(--border);color:var(--muted);font:12px var(--mono)}
@media(max-width:760px){.tiles,.grid2{grid-template-columns:1fr}.top .tag{display:none}}
`;

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${CSS}</style></head>
<body><header class="top"><div class="shell top-in"><a class="logo" href="/"><span class="dot"></span>evalkit</a><span class="tag">local run viewer · nothing leaves this machine</span></div></header>
<main><div class="shell">${body}</div></main></body></html>`;
}

function scoreClass(rate) {
  return (rate ?? 1) < 0.5 ? "low" : "";
}

function indexPage(runs) {
  const body = `<h1>Runs</h1><p class="lead">Local reports from <code>evalkit-runs/</code>. Nothing here leaves your machine.</p>`
    + (runs.length
      ? `<div class="runs">${runs.map(({ file, report }) => {
        const s = report.summary ?? {};
        const rate = s.total ? (s.passed ?? 0) / s.total : 0;
        return `<a class="run-card" href="/run/${encodeURIComponent(file)}">
<div class="head"><div><div class="title">${escapeHtml(report.pack?.title ?? report.pack?.name ?? "run")}</div><div class="sub">${escapeHtml(report.pack?.name ?? "")} ${escapeHtml(report.pack?.version ?? "")} · ${escapeHtml(report.meta?.model ?? "?")} · ${escapeHtml(report.meta?.startedAt ?? "")}</div></div><div class="score"><span class="n ${scoreClass(rate)}">${s.passed ?? "?"}/${s.total ?? "?"}</span><span class="l">passed</span></div></div>
<div class="bar"><i class="${scoreClass(rate)}" style="width:${pct(rate)}"></i></div>
</a>`;
      }).join("")}</div>`
      : `<div class="empty">No runs yet. Run one, then reload:<br><br><code>evalkit run packs/receptionist-v1 --model &lt;name&gt;</code></div>`);
  return shell("evalkit runs", body);
}

function tile(label, value, cls = "") {
  return `<div class="tile"><div class="k">${escapeHtml(label)}</div><div class="v ${cls}">${escapeHtml(value)}</div></div>`;
}

function bar(rate) {
  return `<span class="track"><i class="${(rate ?? 0) < 0.5 ? "low" : ""}" style="width:${pct(rate)}"></i></span>`;
}

function runPage(report) {
  const s = report.summary ?? { byTag: [], byCheck: [], failures: [] };
  const items = report.items ?? [];
  const rate = s.total ? (s.passed ?? 0) / s.total : 0;
  const meta = report.meta ?? {};

  const chips = [
    `<span class="chip">model <b>${escapeHtml(meta.model ?? "?")}</b></span>`,
    `<span class="chip">endpoint <b>${escapeHtml(meta.baseUrl ?? "?")}</b></span>`,
    meta.hardware ? `<span class="chip">hardware <b>${escapeHtml(meta.hardware)}</b></span>` : "",
    meta.medianLatencyMs != null ? `<span class="chip">median latency <b>${meta.medianLatencyMs} ms</b></span>` : "",
    `<span class="chip">run <b>${escapeHtml(meta.startedAt ?? "?")}</b></span>`,
  ].join("");

  const tagRows = (s.byTag ?? []).map((row) => `<tr><td>${escapeHtml(row.tag)}</td><td class="num">${row.passed}/${row.total}</td><td class="num">${pct(row.total ? row.passed / row.total : 0)}</td><td>${bar(row.total ? row.passed / row.total : 0)}</td></tr>`).join("");
  const checkRows = (s.byCheck ?? []).map((row) => `<tr><td><code>${escapeHtml(row.kind)}</code></td><td class="num">${row.passed}/${row.total}</td><td>${bar(row.total ? row.passed / row.total : 0)}</td></tr>`).join("");

  const itemBlocks = items.map((item) => {
    const checks = (item.checks ?? []).map((check) => `<div class="check"><span class="cm ${check.passed ? "pass" : "fail"}">${check.passed ? "pass" : "FAIL"}</span><span class="kind">${escapeHtml(check.kind)}</span><span class="detail-t">${escapeHtml(check.detail)}</span></div>`).join("");
    const output = item.output ? `<div class="out-label">Model output</div><pre class="out">${escapeHtml(item.output)}</pre>` : "";
    const meter = item.meter ? `<div class="chip" style="margin-top:12px">tokens <b>${item.meter.completionTokens ?? "?"}</b> · ${item.meter.tokensPerSecond ?? "?"} tok/s · ${item.meter.elapsedMs ?? "?"} ms</div>` : "";
    return `<details class="item ${item.passed ? "pass" : "fail"}"><summary><span class="mark">${item.passed ? "✓" : "✗"}</span><span class="id">${escapeHtml(item.id)}</span><span class="tags">${(item.tags ?? []).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}</span><span class="chev">›</span></summary><div class="detail"><div class="checks">${checks}</div>${meter}${output}</div></details>`;
  }).join("");

  const body = `<div class="crumb"><a href="/">← all runs</a></div>
<h1>${escapeHtml(report.pack?.title ?? "run")}</h1>
<p class="lead">${escapeHtml(report.pack?.name ?? "")} ${escapeHtml(report.pack?.version ?? "")} — fixed dataset and scoring rules. Results are comparable only within this pack version.</p>
<div class="meta">${chips}</div>

<div class="tiles" style="margin-top:24px">
${tile("Passed", `${s.passed ?? 0} / ${s.total ?? 0}`, (s.failed ?? 0) ? "fail" : "pass")}
${tile("Pass rate", pct(rate), rate < 0.5 ? "fail" : "pass")}
${tile("Failed", String(s.failed ?? 0), s.failed ? "fail" : "")}
</div>

<div class="grid2">
<div><h2>By group</h2><table><tr><th>Group</th><th class="num">Pass</th><th class="num">Rate</th><th></th></tr>${tagRows}</table></div>
<div><h2>By check</h2><table><tr><th>Check</th><th class="num">Pass</th><th></th></tr>${checkRows}</table></div>
</div>

<h2>Items</h2>
<div class="items">${itemBlocks}</div>

<details class="md"><summary>Markdown report (paste into a PR or an issue)</summary><pre class="out">${escapeHtml(toMarkdown(report))}</pre></details>
<div class="foot">evalkit · ${escapeHtml(report.pack?.name ?? "")} ${escapeHtml(report.pack?.version ?? "")} · served locally on 127.0.0.1</div>`;
  return shell(report.pack?.title ?? "run", body);
}

/** Start the local viewer. Returns the http.Server. */
export function serveRuns({ runsDir, port = 4173, host = "127.0.0.1" }) {
  const server = createServer((request, response) => {
    const url = new URL(request.url, `http://${host}`);
    const send = (status, type, body) => { response.writeHead(status, { "content-type": type }); response.end(body); };
    if (url.pathname === "/") return send(200, "text/html; charset=utf-8", indexPage(listRuns(runsDir)));
    if (url.pathname === "/api/runs") return send(200, "application/json", JSON.stringify(listRuns(runsDir).map(({ file, report }) => ({ file, pack: report.pack, meta: report.meta, summary: report.summary }))));
    if (url.pathname.startsWith("/run/")) {
      const file = decodeURIComponent(url.pathname.slice("/run/".length));
      if (!/^[a-z0-9._-]+\.json$/i.test(file)) return send(400, "text/plain", "bad run id");
      try { return send(200, "text/html; charset=utf-8", runPage(JSON.parse(readFileSync(join(runsDir, file), "utf8")))); }
      catch { return send(404, "text/plain", "run not found"); }
    }
    send(404, "text/plain", "not found");
  });
  server.listen(port, host);
  return server;
}
