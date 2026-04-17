import fs from "node:fs";
import { CONFIG_DIR, CONFIG_PATH, DEFAULT_API_URL } from "./constants";

export interface Config {
  token?: string;
  apiUrl?: string;
  linkedProject?: string;
  user?: { email?: string; name?: string; role?: string } | null;
}

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

export function readConfig(): Config {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.chmodSync(CONFIG_PATH, 0o600);
  } catch {
    // Ignore chmod failures on non-POSIX environments.
  }
}

export function getApiUrl(config: Config): string {
  return process.env.LPAD_API_URL ?? config.apiUrl ?? DEFAULT_API_URL;
}

export function getToken(config: Config): string {
  return process.env.LPAD_TOKEN ?? config.token ?? "";
}
