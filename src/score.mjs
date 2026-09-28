// Pure scoring: apply a pack item's checks to a model output. No I/O, no network,
// fully unit-testable. The output keeps per-check detail, because the failures are
// the useful part of a benchmark, not the aggregate.

/** Read a dotted path out of a nested object (e.g. "booking.date"). */
export function readPath(value, path) {
  return path.split(".").reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(key);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current !== "object") return undefined;
    return current[key];
  }, value);
}

/** Parse the first fenced code block, else the whole string, as JSON. */
export function extractJson(text) {
  if (typeof text !== "string") return { ok: false };
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try { return { ok: true, value: JSON.parse(candidate) }; } catch { return { ok: false }; }
}

/** Compile a user pattern, tolerating a leading inline (?i) the way users write it. */
export function compilePattern(pattern, flags = "") {
  let source = pattern;
  let effectiveFlags = flags;
  if (source.startsWith("(?i)")) {
    source = source.slice(4);
    if (!effectiveFlags.includes("i")) effectiveFlags += "i";
  }
  return new RegExp(source, effectiveFlags);
}

function runCheck(check, output) {
  const text = typeof output === "string" ? output : "";
  switch (check.kind) {
    case "must_include": {
      const passed = text.toLowerCase().includes(check.value.toLowerCase());
      return { kind: "must_include", passed, detail: passed ? "present" : `missing "${check.value}"` };
    }
    case "must_not_include": {
      const passed = !text.toLowerCase().includes(check.value.toLowerCase());
      return { kind: "must_not_include", passed, detail: passed ? "absent" : `found forbidden "${check.value}"` };
    }
    case "regex": {
      let passed = false;
      try { passed = compilePattern(check.value, check.flags ?? "").test(text); } catch { return { kind: "regex", passed: false, detail: `invalid regex "${check.value}"` }; }
      return { kind: "regex", passed, detail: passed ? "matched" : `no match for /${check.value}/` };
    }
    case "contains_all": {
      const missing = check.values.filter((value) => !text.toLowerCase().includes(value.toLowerCase()));
      return { kind: "contains_all", passed: missing.length === 0, detail: missing.length === 0 ? "all present" : `missing ${missing.map((value) => `"${value}"`).join(", ")}` };
    }
    case "json_field": {
      const parsed = extractJson(output);
      if (!parsed.ok) return { kind: "json_field", passed: false, detail: "output is not valid JSON" };
      const actual = readPath(parsed.value, check.path);
      if (check.equals !== undefined) {
        const passed = actual === check.equals;
        return { kind: "json_field", passed, detail: passed ? `${check.path} = ${JSON.stringify(actual)}` : `${check.path} was ${JSON.stringify(actual)}, expected ${JSON.stringify(check.equals)}` };
      }
      let passed = false;
      try { passed = typeof actual === "string" && compilePattern(check.matches).test(actual); } catch { return { kind: "json_field", passed: false, detail: `invalid regex "${check.matches}"` }; }
      return { kind: "json_field", passed, detail: passed ? `${check.path} matched` : `${check.path} was ${JSON.stringify(actual)}, expected /${check.matches}/` };
    }
    default:
      return { kind: check.kind, passed: false, detail: `unknown check kind "${check.kind}"` };
  }
}

/** Score one item's output. `mode` is "all_checks" or "any_check" from the manifest. */
export function scoreItem(item, output, mode = "all_checks") {
  const checks = item.expect.map((check) => runCheck(check, output));
  const passed = mode === "any_check" ? checks.some((check) => check.passed) : checks.every((check) => check.passed);
  return { id: item.id, tags: item.tags ?? [], passed, checks };
}

/** Aggregate scored items into headline numbers, keeping failures grouped by tag. */
export function summarize(scored) {
  const total = scored.length;
  const passed = scored.filter((item) => item.passed).length;
  const failed = total - passed;
  const checkStats = new Map();
  const tagStats = new Map();
  for (const item of scored) {
    for (const check of item.checks) {
      const stat = checkStats.get(check.kind) ?? { kind: check.kind, total: 0, passed: 0 };
      stat.total += 1;
      if (check.passed) stat.passed += 1;
      checkStats.set(check.kind, stat);
    }
    for (const tag of item.tags) {
      const stat = tagStats.get(tag) ?? { tag, total: 0, passed: 0 };
      stat.total += 1;
      if (item.passed) stat.passed += 1;
      tagStats.set(tag, stat);
    }
  }
  return {
    total,
    passed,
    failed,
    passRate: total ? passed / total : 0,
    byCheck: [...checkStats.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    byTag: [...tagStats.values()].sort((a, b) => a.tag.localeCompare(b.tag)),
    failures: scored.filter((item) => !item.passed).map((item) => ({ id: item.id, tags: item.tags, failedChecks: item.checks.filter((check) => !check.passed) })),
  };
}
