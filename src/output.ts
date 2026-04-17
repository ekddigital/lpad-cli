/**
 * Returns true when ANSI color codes should be emitted for a given stream.
 *
 * Rules (in precedence order):
 *  1. NO_COLOR env var — if set to any non-empty value, disable color.
 *     Spec: https://no-color.org/
 *  2. TERM=dumb — terminal has no color support.
 *  3. isTTY — disable when output is piped/redirected (not an interactive terminal).
 *
 * Pass `process.stderr.isTTY` for status messages, `process.stdout.isTTY`
 * for data output printed with console.log().
 */
export function isColorEnabled(isTTY: boolean | undefined): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  if (process.env.TERM === "dumb") return false;
  return isTTY === true;
}

function color(code: string, text: string): string {
  if (!isColorEnabled(process.stderr.isTTY)) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

/** Successful operation. Written to stderr (status message, not data). */
export function ok(msg: string): void {
  process.stderr.write(`${color("32", "OK")}: ${msg}\n`);
}

/** Informational status. Written to stderr. */
export function info(msg: string): void {
  process.stderr.write(`${color("34", "->")}: ${msg}\n`);
}

/** Non-fatal warning. Written to stderr. */
export function warn(msg: string): void {
  process.stderr.write(`${color("33", "!")}: ${msg}\n`);
}

/** Fatal error — prints to stderr and exits non-zero. */
export function fail(msg: string, code = 1): never {
  process.stderr.write(`${color("31", "ERR")}: ${msg}\n`);
  process.exit(code);
}
