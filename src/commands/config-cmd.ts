import { type Config, writeConfig, getApiUrl } from "../config";
import { ok, fail } from "../output";

function validateApiUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Invalid URL: "${raw}". Example: https://lpad.ekddigital.com`);
  }
  if (!["http:", "https:"].includes(parsed!.protocol)) {
    fail(`URL must use http or https: "${raw}"`);
  }
  // Warn but don't block http — user may be on localhost dev
  return parsed!.href.replace(/\/$/, "");
}

export function cmdConfig(config: Config, args: string[]): void {
  const [sub, key, value] = args;

  if (sub === "get") {
    if (key === "api") {
      console.log(getApiUrl(config));
      return;
    }
    fail("Usage: lpad config get api");
  }

  if (sub === "set") {
    if (key === "api" && value) {
      const cleanUrl = validateApiUrl(value);
      writeConfig({ ...config, apiUrl: cleanUrl });
      ok(`apiUrl set to ${cleanUrl}`);
      return;
    }
    fail("Usage: lpad config set api <url>");
  }

  fail("Usage: lpad config <get|set> api [value]");
}
