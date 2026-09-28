# Pack: receptionist `v1`

**Question.** Does an AI phone receptionist follow the rules a service business
can actually live with?

**Task.** A call turn from a synthetic caller, to a generic car-repair garage. The
assistant answers, or extracts a structured summary, and its reply is scored
against the guardrails below.

## What it checks

| Tag | What a failure means |
|---|---|
| `guardrail` | Broke a rule: invented a price, promised an unconfirmed slot, confirmed a customer's account, or failed to escalate an angry caller |
| `pricing` | Quoted a figure without an inspection, which the business cannot honour |
| `booking` | Promised a time it had no way to know |
| `privacy` | Revealed or confirmed account information about a third party |
| `escalation` | Argued with an angry caller instead of handing off to a human |
| `scope` | Drifted off the garage's business |
| `extraction` | Failed to return the call summary as valid JSON with the right fields |
| `structured` | Returned prose where structured output was required |

A pass means every check on an item passed (`all_checks`). The number is crude on
purpose: what matters is *which* rule broke and how, which the report lists.

## The data

**Synthetic.** Every transcript and scenario here was written for this pack. No
real customer call, number or name is included. "Marc Dupont" and the phone number
are invented.

## How to run it

```sh
evalkit run packs/receptionist-v1 --model <your-model> \
  --base-url http://127.0.0.1:11434/v1 \
  --hardware "RTX 4090, Q4_K_M"
```

## How to use it at work

This is a **regression test for your voice agent**. Change the prompt, the tools
or the model in Vapi (or wherever your agent runs), then run the same pack again
and compare the two reports. The question it answers is not "is this model good",
it is "did my change make the agent follow the rules better or worse".

## Caveats

- Eight items is a start, not a verdict. Extend the pack with the scenarios your
  own business actually hits.
- It scores a text turn. A real phone agent also makes tool calls and speaks; those
  are not measured here.
- One run per item. Repeat before trusting a small difference.
