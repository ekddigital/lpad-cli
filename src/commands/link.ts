import { type Config, writeConfig } from "../config";
import { ok, fail } from "../output";

export function cmdLink(config: Config, projectSlug: string | undefined): void {
  if (!projectSlug) fail("Usage: lpad link <projectSlug>");
  writeConfig({ ...config, linkedProject: projectSlug });
  ok(`Linked default project: ${projectSlug}`);
}

export function cmdUnlink(config: Config): void {
  const { linkedProject: _lp, ...rest } = config;
  writeConfig(rest);
  ok("Unlinked default project.");
}
