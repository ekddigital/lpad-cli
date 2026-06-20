import { type Config, getApiUrl, getToken } from "../config";
import { inferSlugFromCwd } from "../lpad-dir";
import { scaffoldLpadDir } from "../scaffold";
import { ok, info, fail } from "../output";

export async function cmdInit(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const slug =
    projectArg ??
    (typeof flags.slug === "string" ? flags.slug : undefined) ??
    inferSlugFromCwd();

  if (!slug) {
    fail(
      "Usage: lpad init <projectSlug>  (or run from a named project directory)",
    );
  }

  const result = await scaffoldLpadDir({
    config,
    slug,
    apiUrl,
    token,
    force: Boolean(flags.force),
    includeAssets: !flags["no-assets"],
    fetchFromServer: true,
  });

  if (result.created) {
    ok(`Initialized ${result.manifestFile}`);
  } else if (result.updated) {
    ok(`Updated ${result.manifestFile}`);
  } else {
    ok(`Linked project: ${slug}`);
  }

  info(`Platform domain: ${result.platformDomain}`);
  if (result.productionDomain) info(`Production domain: ${result.productionDomain}`);
  info("Secrets stay in Launchpad — use `lpad env set` for production values.");
}
