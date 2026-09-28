// A tiny local viewer for run reports. No dependency, no build step: an HTTP
// server that reads evalkit-runs/*.json and renders them. Nothing leaves the
// machine; it binds to 127.0.0.1 only.

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { toMarkdown } from "./report.mjs";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function listRuns(runsDir) {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        const report = JSON.parse(readFileSync(join(runsDir, name), "utf8"));
        return { file: name, report };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => (b.report.meta?.startedAt ?? "").localeCompare(a.report.meta?.startedAt ?? ""));
}

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
:root{--bg:#0e1110;--panel:#161b19;--border:#252d29;--fg:#dfe6df;--muted:#8b998d;--pass:#9fbf62;--fail:#d98a7a;--accent:#9fbf62}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.shell{max-width:1000px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:26px;font-weight:500;margin:0 0 4px}h2{font-size:16px;font-weight:500;margin:28px 0 12px}
.muted{color:var(--muted)}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.card{border:1px solid var(--border);background:var(--panel);padding:14px 16px;margin:8px 0;border-radius:6px}
.card:hover{border-color:#3c4a3f}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.badge{font-family:ui-monospace,monospace;font-size:12px;color:var(--pass)}.badge.fail{color:var(--fail)}
.pill{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:1px 8px;font-family:ui-monospace,monospace;font-size:11px;color:var(--muted);margin-right:6px}
table{width:100%;border-collapse:collapse;margin:8px 0}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);font-size:13px}
.item{border:1px solid var(--border);border-radius:6px;margin:6px 0;background:var(--panel)}
.item.pass{border-left:3px solid var(--pass)}.item.fail{border-left:3px solid var(--fail)}
.item summary{padding:10px 14px;cursor:pointer;display:flex;justify-content:space-between;gap:12px}
pre{background:#0b0e0d;border:1px solid var(--border);border-radius:6px;padding:12px;overflow:auto;font-size:12.5px}
.detail{padding:0 14px 14px}
</style></head><body><div class="shell">${body}</div></body></html>`;
}

function indexPage(runs) {
  const body = `<h1>evalkit runs</h1><p class="muted">Local reports from <code>evalkit-runs/</code>. Nothing here leaves your machine.</p>`
    + (runs.length ? runs.map(({ file, report }) => {
      const s = report.summary ?? {};
      return `<a class="card" href="/run/${encodeURIComponent(file)}"><div class="row"><div><strong>${escapeHtml(report.pack?.title ?? report.pack?.name ?? "run")}</strong><div class="muted">${escapeHtml(report.meta?.model ?? "?")} · ${escapeHtml(report.meta?.startedAt ?? "")}</div></div><div class="badge ${s.failed ? "fail" : ""}">${s.passed ?? "?"}/${s.total ?? "?"}</div></div></a>`;
    }).join("") : `<p class="muted">No runs yet. Run one, then reload: <code>evalkit run packs/receptionist-v1 --model &lt;name&gt;</code></p>`);
  return shell("evalkit runs", body);
}

function runPage(report) {
  const s = report.summary ?? { byTag: [], byCheck: [], failures: [] };
  const items = report.items ?? [];
  const body = `<p><a href="/">← all runs</a></p>
<h1>${escapeHtml(report.pack?.title ?? "run")}</h1>
<p class="muted"><code>${escapeHtml(report.meta?.model ?? "?")}</code> · ${escapeHtml(report.meta?.baseUrl ?? "")} · ${escapeHtml(report.meta?.startedAt ?? "")}${report.meta?.hardware ? ` · ${escapeHtml(report.meta.hardware)}` : ""}</p>
<p><span class="badge ${s.failed ? "fail" : ""}">${s.passed}/${s.total} passed (${s.passRate != null ? Math.round(s.passRate * 1000) / 10 : "?"}%)</span></p>
<h2>By group</h2><table><tr><th>Group</th><th>Passed</th><th>Total</th></tr>${(s.byTag ?? []).map((r) => `<tr><td>${escapeHtml(r.tag)}</td><td>${r.passed}</td><td>${r.total}</td></tr>`).join("")}</table>
<h2>By check</h2><table><tr><th>Check</th><th>Passed</th><th>Total</th></tr>${(s.byCheck ?? []).map((r) => `<tr><td>${escapeHtml(r.kind)}</td><td>${r.passed}</td><td>${r.total}</td></tr>`).join("")}</table>
<h2>Items</h2>${items.map((item) => `<details class="item ${item.passed ? "pass" : "fail"}"><summary><span>${item.passed ? "✓" : "✗"} <code>${escapeHtml(item.id)}</code></span><span class="muted">${(item.tags ?? []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}</span></summary><div class="detail">${item.checks ? `<table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${item.checks.map((c) => `<tr><td><code>${escapeHtml(c.kind)}</code></td><td class="badge ${c.passed ? "" : "fail"}">${c.passed ? "pass" : "fail"}</td><td class="muted">${escapeHtml(c.detail)}</td></tr>`).join("")}</table>` : ""}${item.output ? `<p class="muted">Output</p><pre>${escapeHtml(item.output)}</pre>` : ""}</div></details>`).join("")}
<h2>Markdown</h2><pre>${escapeHtml(toMarkdown(report))}</pre>`;
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
