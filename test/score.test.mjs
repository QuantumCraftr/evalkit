import assert from "node:assert/strict";
import { test } from "node:test";
import { extractJson, readPath, scoreItem, summarize, compilePattern } from "../src/score.mjs";

const item = (expect) => ({ id: "x", tags: [], expect });

test("readPath walks dotted paths and arrays", () => {
  assert.equal(readPath({ a: { b: 1 } }, "a.b"), 1);
  assert.equal(readPath({ a: [{ b: 2 }] }, "a.0.b"), 2);
  assert.equal(readPath({ a: null }, "a.b"), undefined);
});

test("extractJson reads fenced and bare JSON", () => {
  assert.deepEqual(extractJson('{"a":1}').value, { a: 1 });
  assert.deepEqual(extractJson('here:\n```json\n{"a":2}\n```').value, { a: 2 });
  assert.equal(extractJson("not json").ok, false);
});

test("must_include and must_not_include are case-insensitive", () => {
  const pass = scoreItem(item([{ kind: "must_include", value: "Brake" }]), "we handle brake work");
  assert.equal(pass.passed, true);
  const fail = scoreItem(item([{ kind: "must_not_include", value: "price" }]), "the price is 40");
  assert.equal(fail.passed, false);
  assert.match(fail.checks[0].detail, /found forbidden/);
});

test("contains_all fails with the list of what is missing", () => {
  const result = scoreItem(item([{ kind: "contains_all", values: ["clutch", "inspection"] }]), "clutch replaced");
  assert.equal(result.passed, false);
  assert.match(result.checks[0].detail, /"inspection"/);
});

test("json_field equals and matches, including explicit null", () => {
  const output = '```json\n{"name":null,"vehicle":"A Clio"}\n```';
  const ok = scoreItem(item([{ kind: "json_field", path: "name", equals: null }, { kind: "json_field", path: "vehicle", matches: "(?i)clio" }]), output);
  assert.equal(ok.passed, true);
  const bad = scoreItem(item([{ kind: "json_field", path: "name", equals: "Marc" }]), output);
  assert.equal(bad.passed, false);
  assert.match(bad.checks[0].detail, /was null/);
});

test("json_field on non-JSON output fails cleanly", () => {
  const result = scoreItem(item([{ kind: "json_field", path: "a", equals: 1 }]), "sorry, I cannot");
  assert.equal(result.passed, false);
  assert.match(result.checks[0].detail, /not valid JSON/);
});

test("any_check mode passes if one check passes", () => {
  const checks = [{ kind: "must_include", value: "a" }, { kind: "must_include", value: "b" }];
  assert.equal(scoreItem(item(checks), "only b here", "any_check").passed, true);
  assert.equal(scoreItem(item(checks), "only b here", "all_checks").passed, false);
});

test("compilePattern tolerates a leading inline (?i)", () => {
  assert.equal(compilePattern("(?i)garage").test("GARAGE"), true);
  assert.equal(compilePattern("garage").test("GARAGE"), false);
});

test("summarize groups failures by tag and check kind", () => {
  const scored = [
    scoreItem({ id: "a", tags: ["guardrail"], expect: [{ kind: "must_include", value: "x" }] }, "x"),
    scoreItem({ id: "b", tags: ["guardrail"], expect: [{ kind: "must_include", value: "y" }] }, "nope"),
  ];
  const summary = summarize(scored);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.passRate, 0.5);
  assert.deepEqual(summary.byTag, [{ tag: "guardrail", total: 2, passed: 1 }]);
  assert.equal(summary.failures.length, 1);
  assert.equal(summary.failures[0].id, "b");
});
