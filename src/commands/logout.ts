import { type Config, writeConfig } from "../config";
import { ok } from "../output";

export function cmdLogout(config: Config): void {
  const { token: _t, user: _u, ...rest } = config;
  writeConfig(rest);
  ok("Logged out.");
}
