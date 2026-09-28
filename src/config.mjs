// CLI argument parsing. Pure and testable: no I/O, no process.exit here.

const DEFAULTS = { baseUrl: "http://127.0.0.1:8080/v1", model: null, apiKey: "not-needed", temperature: 0, maxTokens: 1024, timeoutMs: 120000, hardware: null, json: false, stream: true };

/** Parse `evalkit run <pack> [flags]` style argv (already sliced past the command). */
export function parseRunArgs(argv) {
  const errors = [];
  const options = { ...DEFAULTS };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) { positionals.push(arg); continue; }
    const key = arg.slice(2);
    const next = argv[index + 1];
    const takeValue = () => { index += 1; return next; };
    switch (key) {
      case "base-url": options.baseUrl = takeValue(); break;
      case "model": options.model = takeValue(); break;
      case "api-key": options.apiKey = takeValue(); break;
      case "temperature": options.temperature = Number(takeValue()); break;
      case "max-tokens": options.maxTokens = Number(takeValue()); break;
      case "timeout-ms": options.timeoutMs = Number(takeValue()); break;
      case "hardware": options.hardware = takeValue(); break;
      case "json": options.json = true; break;
      case "stream": options.stream = true; break;
      case "no-stream": options.stream = false; break;
      default: errors.push(`unknown flag --${key}`);
    }
  }
  if (positionals.length !== 1) errors.push("exactly one pack directory is required");
  if (!options.model) errors.push("--model is required (the served model name)");
  if (typeof options.baseUrl !== "string" || !/^https?:\/\//.test(options.baseUrl)) errors.push("--base-url must be an http(s) URL");
  for (const key of ["temperature", "maxTokens", "timeoutMs"]) if (!Number.isFinite(options[key]) || options[key] < 0) errors.push(`--${key} must be a non-negative number`);
  return { errors, options, packDir: positionals[0] ?? null };
}
