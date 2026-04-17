function color(code: string, text: string): string {
  if (process.env.NO_COLOR === "1") return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export function ok(msg: string): void {
  console.log(`${color("32", "OK")}: ${msg}`);
}

export function info(msg: string): void {
  console.log(`${color("34", "->")}: ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${color("33", "!")}: ${msg}`);
}

export function fail(msg: string, code = 1): never {
  console.error(`${color("31", "ERR")}: ${msg}`);
  process.exit(code);
}
