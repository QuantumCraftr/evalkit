# Pack: dev-spec `v1`

**Question.** Given a small, precise spec, does a coding model implement what was
actually asked, including the constraints it was told to respect?

**Task.** Each item is a short spec for one JavaScript function, with the
requirements that decide the answer: the edge cases, the forbidden shortcut, the
security rule. The model returns code; the checks inspect it.

## What it checks

| Tag | What a failure means |
|---|---|
| `function` | Wrong or missing signature, or did not do the core job |
| `edge-cases` | Ignored the stated edge cases (empty input, negatives, caps) |
| `timing` | Got the timing semantics wrong (leading vs trailing edge) |
| `security` | Took the unsafe route that was explicitly forbidden |
| `sql` | Built a query by string concatenation instead of parameters |
| `error-handling` | Swallowed an error, or lost the required context |
| `api` | Wrong shape of the returned value, or no cursor handling |

## What this is not

This is a **static screen**: it reads the code the model produced, it does not
**run** it. A passing answer can still be wrong at runtime, and a clever answer
could satisfy a check without being correct. It is cheap, fast, and catches the
common failures (forbidden shortcuts, missing edge cases, wrong return shape), not
everything. A real coding benchmark runs the code; that is a different, heavier
tool, and this pack says so in its own report caveats.

So: use it to triage and to catch regressions when you change a prompt or a model,
not to certify correctness.

## The data

Written for this pack. The specs are original and deliberately small.

## How to run it

```sh
evalkit run packs/dev-spec-v1 --model <your-model> \
  --base-url http://127.0.0.1:11434/v1 \
  --max-tokens 1500
```

## How to use it at work

Change your coding agent's model, prompt or system message, run the same pack
again, compare. The useful signal is which constraint a model keeps dropping (the
parameterized query, the trailing-edge debounce), not the headline score.
