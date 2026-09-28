# evalkit

A small, dependency-free harness to score a local LLM on a real task.

You install nothing (no Python, no framework). You point it at any
**OpenAI-compatible** endpoint (Ollama, llama.cpp, vLLM, LM Studio, Strata, …),
name a **pack**, and get a report: what passed, what failed, and why.

```sh
npx evalkit list
npx evalkit run packs/receptionist-v1 --model qwen3 --base-url http://127.0.0.1:11434/v1
```

That writes `evalkit-runs/<pack>-<timestamp>.json` and `.md`. **Nothing is
uploaded.** The run stays on your machine until you choose to share it.

> evalkit grew out of **[vram.wiki](https://vram.wiki)**, a catalog of what people
> really do with local LLMs. The catalog, the `/learn` path and this harness share
> one stance: evidence over benchmarks, failures are the result, and a number is
> worthless without its limits. evalkit is the tooling side of that; vram.wiki is
> where the setups live.


## Why another eval tool

Because most eval tools answer "how does this model do on MMLU", and that tells
you nothing about *your* task. This one is built on four rules, borrowed from
people who benchmark honestly:

1. **A fixed pack, or it is not a comparison.** Results are comparable only
   within one pack version. A pack is a dataset plus its scoring rules, versioned.
2. **The failures are the result.** Every report lists what failed and the reason,
   not just a score. "17/20" tells you little; "missed the three items about
   dates" tells you where to look.
3. **One variable at a time.** A pack measures a setup (model + quant + runtime +
   settings). Change one thing, run again, compare.
4. **A number without its limits is a claim.** Every report carries its caveats:
   one run per item, temperature 0, setups not models.

## Commands

```sh
evalkit list                       # packs shipped with the tool
evalkit validate <pack-dir>        # check a pack before running it
evalkit run <pack-dir> --model <name> [options]
```

| Option | Default | |
|---|---|---|
| `--base-url` | `http://127.0.0.1:8080/v1` | OpenAI-compatible base URL |
| `--model` | — | model name to send (required) |
| `--api-key` | `not-needed` | bearer token |
| `--temperature` | `0` | sampling temperature |
| `--max-tokens` | `1024` | max tokens per answer |
| `--timeout-ms` | `120000` | per-call timeout |
| `--hardware` | — | free-text hardware note recorded in the report |
| `--json` | off | print the JSON report to stdout too |

## Anatomy of a pack

```
packs/<name>/
  manifest.json     # name, version, title, description, dataset file, scoring mode
  dataset.jsonl     # one JSON item per line
  README.md         # what the pack measures and where its data comes from
```

An **item** is one task:

```json
{
  "id": "no-promised-slot",
  "tags": ["guardrail", "booking"],
  "system": "You are an AI phone receptionist. You may not promise a slot without checking the calendar.",
  "input": "Caller: Can you book me in tomorrow at 8am?",
  "expect": [
    { "kind": "must_not_include", "value": "tomorrow at 8" },
    { "kind": "regex", "value": "(?i)(call you back|callback|confirm)" }
  ]
}
```

**Checks** (`expect`): `must_include`, `must_not_include`, `contains_all`,
`regex`, `json_field` (`path` + `equals` or `matches`). `regex` and `matches`
tolerate a leading `(?i)` for case-insensitive matching.

`scoring` in the manifest is `all_checks` (default: every check must pass) or
`any_check` (at least one).

## Writing a pack

A pack must be **publishable**: its dataset has to be something you have the right
to share. Real customer data, private transcripts or personal information never
belong in a pack. Use synthetic or expressly shareable material. For your own
private data, run a pack locally and keep the results; do not commit the data.

Keep a pack small and honest. Eight to fifty items that each test one thing beat
a thousand scraped rows.

## Design notes

- **Sequential calls.** Local servers answer one request at a time; parallel calls
  would measure contention, not the model.
- **Client-side meter.** Timing and token counts come from the same code for every
  backend, so they are comparable. Non-streamed responses report wall time and
  decode rate, and say the TTFT is not separable.
- **A failed call is a failed item**, with the reason, never a silent skip.
- **No SDK.** Plain `fetch`, Node 20+. The whole thing is a few hundred lines you
  can read in one sitting.

## Tests

```sh
npm test
```

## Status

`v0.1`. The pack format may still change; a change is a version bump, and results
are only comparable within a pack version.

## Links

- **vram.wiki** — the catalog this grew out of: <https://vram.wiki>
- **Why this exists**, the reading path behind it: <https://vram.wiki/learn>
- Benchmark method we borrowed from, and credit: [`boxabirds/awesome-local-ai`](https://github.com/boxabirds/awesome-local-ai)
- Issues and packs: <https://github.com/QuantumCraftr/evalkit/issues>

## License

MIT.
