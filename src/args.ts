export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (!token.startsWith("-")) {
      positional.push(token);
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }

    const short = token.slice(1);
    if (short === "v") {
      flags.version = true;
      continue;
    }
    if (short === "h") {
      flags.help = true;
      continue;
    }
    flags[short] = true;
  }

  return { positional, flags };
}
