// One OpenAI-compatible chat call, metered. No SDK: plain fetch, so it works
// against Ollama, llama.cpp, vLLM, LM Studio, Strata, or any /v1 endpoint.
// The meter is client-side and identical for every backend, which is what makes
// numbers comparable across models.
//
// Streaming is the default because it is the only way to separate what a user
// feels (time to first token) from how fast the rest arrives (decode). Note the
// honesty rule: a backend that coalesces many tokens into one chunk undercounts
// the decode rate; the meter records what it actually saw.

/**
 * Call an OpenAI-compatible /chat/completions endpoint and return the output
 * plus a measurement. `fetchImpl` is injectable for tests.
 */
export async function callModel({ baseUrl, model, input, system = null, apiKey = "not-needed", maxTokens = 1024, temperature = 0, timeoutMs = 120000, stream = true }, fetchImpl = fetch) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: input }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = now();
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return stream && response.body ? await readStream(response, startedAt) : await readWhole(response, startedAt);
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    return { ok: false, error: isAbort ? `timeout after ${timeoutMs}ms` : String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

async function readWhole(response, startedAt) {
  const payload = await response.json();
  const endedAt = now();
  const choice = payload.choices?.[0];
  const usage = payload.usage ?? {};
  const elapsedMs = endedAt - startedAt;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : null;
  return {
    ok: true,
    output: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
    meter: {
      elapsedMs: Math.round(elapsedMs),
      promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      completionTokens,
      ttftMs: null,
      decodeMs: null,
      tokensPerSecond: completionTokens && elapsedMs > 0 ? round2((completionTokens * 1000) / elapsedMs) : null,
      effectiveTokensPerSecond: completionTokens && elapsedMs > 0 ? round2((completionTokens * 1000) / elapsedMs) : null,
      streamed: false,
      chunks: null,
    },
  };
}

async function readStream(response, startedAt) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let firstContentAt = null;
  let lastChunkAt = null;
  let chunks = 0;
  let finishReason = null;
  let usage = null;
  let reasoning = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      let parsed;
      try { parsed = JSON.parse(data); } catch { continue; }
      if (parsed.usage) usage = parsed.usage;
      const choice = parsed.choices?.[0];
      const delta = choice?.delta ?? {};
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      // Reasoning deltas (Ollama, some builds) come before any visible content.
      // TTFT tracks visible content only: that is what the user waits for.
      if (typeof delta.reasoning === "string" && delta.reasoning) reasoning = true;
      if (typeof delta.content === "string" && delta.content) {
        if (firstContentAt === null) firstContentAt = now();
        content += delta.content;
        lastChunkAt = now();
        chunks += 1;
      }
    }
  }

  const endedAt = now();
  const elapsedMs = endedAt - startedAt;
  const ttftMs = firstContentAt === null ? null : firstContentAt - startedAt;
  const decodeMs = firstContentAt === null || lastChunkAt === null ? null : Math.max(0, lastChunkAt - firstContentAt);
  const completionTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
  // Decode rate uses the tokens that arrived after the first one, over the decode
  // window. Without usage we fall back to the streamed chunk count.
  const decodeTokens = completionTokens !== null ? Math.max(0, completionTokens - 1) : Math.max(0, chunks - 1);
  return {
    ok: true,
    output: content,
    finishReason,
    meter: {
      elapsedMs: Math.round(elapsedMs),
      promptTokens: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
      completionTokens,
      ttftMs: ttftMs === null ? null : Math.round(ttftMs),
      decodeMs: decodeMs === null ? null : Math.round(decodeMs),
      tokensPerSecond: decodeMs && decodeMs > 0 ? round2((decodeTokens * 1000) / decodeMs) : null,
      effectiveTokensPerSecond: completionTokens && elapsedMs > 0 ? round2((completionTokens * 1000) / elapsedMs) : null,
      streamed: true,
      chunks,
      reasoning,
    },
  };
}

const now = () => Number(process.hrtime.bigint()) / 1e6;

function round2(value) {
  return Math.round(value * 100) / 100;
}
