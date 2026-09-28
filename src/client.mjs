// One OpenAI-compatible chat call, metered. No SDK: plain fetch, so it works
// against Ollama, llama.cpp, vLLM, LM Studio, Strata, or any /v1 endpoint.
// The meter is client-side and identical for every backend, which is what makes
// numbers comparable across models.

/**
 * Call an OpenAI-compatible /chat/completions endpoint and return the output
 * plus a measurement. `fetchImpl` is injectable for tests.
 */
export async function callModel({ baseUrl, model, input, system = null, apiKey = "not-needed", maxTokens = 1024, temperature = 0, timeoutMs = 120000 }, fetchImpl = fetch) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const messages = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: input }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = process.hrtime.bigint();
  let firstTokenAt = null;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    const payload = await response.json();
    const endedAt = process.hrtime.bigint();
    const choice = payload.choices?.[0];
    const output = choice?.message?.content ?? "";
    const usage = payload.usage ?? {};
    const elapsedMs = Number(endedAt - startedAt) / 1e6;
    const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : null;
    return {
      ok: true,
      output,
      finishReason: choice?.finish_reason ?? null,
      meter: {
        // Non-streamed response: TTFT is not separable from decode, so we report
        // wall time and decode rate, and say so rather than pretending.
        elapsedMs: Math.round(elapsedMs),
        promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
        completionTokens,
        tokensPerSecond: completionTokens && elapsedMs > 0 ? round2((completionTokens * 1000) / elapsedMs) : null,
        firstTokenMs: firstTokenAt === null ? null : Math.round(firstTokenAt),
        streamed: false,
      },
    };
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    return { ok: false, error: isAbort ? `timeout after ${timeoutMs}ms` : String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
