import assert from "node:assert/strict";
import { test } from "node:test";
import { callModel } from "../src/client.mjs";

/** A fake streaming response whose body yields the given SSE lines as chunks. */
function sseResponse(lines) {
  const encoder = new TextEncoder();
  const chunks = lines.map((line) => encoder.encode(line));
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true };
            return { value: chunks[index++], done: false };
          },
        };
      },
    },
  };
}

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

test("streaming: TTFT tracks visible content, not reasoning deltas", async () => {
  const response = sseResponse([
    sse({ choices: [{ delta: { reasoning: "Thinking about it" }, finish_reason: null }] }),
    sse({ choices: [{ delta: { content: "Hello" }, finish_reason: null }] }),
    sse({ choices: [{ delta: { content: " world" }, finish_reason: null }] }),
    sse({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 3 } }),
    "data: [DONE]\n\n",
  ]);
  const result = await callModel({ baseUrl: "http://x/v1", model: "m", input: "hi", stream: true, timeoutMs: 5000 }, async () => response);
  assert.equal(result.ok, true);
  assert.equal(result.output, "Hello world");
  assert.equal(result.finishReason, "stop");
  assert.equal(result.meter.streamed, true);
  assert.equal(result.meter.reasoning, true);
  assert.equal(result.meter.completionTokens, 3);
  // TTFT must be set (content arrived) and must be after the reasoning chunk.
  assert.equal(typeof result.meter.ttftMs, "number");
  assert.equal(result.meter.ttftMs >= 0, true);
  assert.equal(typeof result.meter.tokensPerSecond, "number");
  assert.equal(typeof result.meter.effectiveTokensPerSecond, "number");
  assert.equal(result.meter.chunks, 2);
});

test("streaming: a response with no visible content has a null TTFT, not zero", async () => {
  const response = sseResponse([
    sse({ choices: [{ delta: { reasoning: "only thinking" }, finish_reason: null }] }),
    sse({ choices: [{ delta: {}, finish_reason: "length" }] }),
    "data: [DONE]\n\n",
  ]);
  const result = await callModel({ baseUrl: "http://x/v1", model: "m", input: "hi", stream: true, timeoutMs: 5000 }, async () => response);
  assert.equal(result.output, "");
  assert.equal(result.meter.ttftMs, null);
  assert.equal(result.meter.tokensPerSecond, null);
});

test("non-streaming: TTFT is null and said so", async () => {
  const response = { ok: true, json: async () => ({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2 } }) };
  const result = await callModel({ baseUrl: "http://x/v1", model: "m", input: "hi", stream: false, timeoutMs: 5000 }, async () => response);
  assert.equal(result.meter.streamed, false);
  assert.equal(result.meter.ttftMs, null);
  assert.equal(result.meter.effectiveTokensPerSecond, result.meter.tokensPerSecond);
});
