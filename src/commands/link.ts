import { type Config, getApiUrl, getToken, writeConfig } from "../config";
import { defaultApiUrlForManifest } from "../lpad-dir";
import { scaffoldLpadDir } from "../scaffold";
import { ok, fail } from "../output";

export async function cmdLink(
  config: Config,
  projectSlug: string | undefined,
): Promise<void> {
  if (!projectSlug) fail("Usage: lpad link <projectSlug>");

  const apiUrl = defaultApiUrlForManifest(getApiUrl(config));
  const token = getToken(config);

  const result = await scaffoldLpadDir({
    config,
    slug: projectSlug,
    apiUrl,
    token: token || undefined,
    fetchFromServer: Boolean(token),
    includeAssets: true,
  });

  ok(`Linked default project: ${projectSlug}`);

  if (result.created) {
    ok(`Created ${result.manifestFile}`);
  } else if (result.updated) {
    ok(`Updated ${result.manifestFile}`);
  }
}

export function cmdUnlink(config: Config): void {
  const { linkedProject: _lp, ...rest } = config;
  writeConfig(rest);
  ok("Unlinked default project.");
}
