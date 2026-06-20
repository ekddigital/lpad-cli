import { type Config, getApiUrl, getToken } from "../config";
import { inferSlugFromCwd } from "../lpad-dir";
import { scaffoldLpadDir } from "../scaffold";
import { ok, info, fail } from "../output";

/**
 * Scaffold `.lpad/` for an existing Launchpad project (same as init, migration UX).
 * Also runs automatically on first `lpad deploy` or `lpad link` when missing.
 */
export async function cmdMigrate(
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
    config.linkedProject ??
    inferSlugFromCwd();

  if (!slug) {
    fail(
      "Usage: lpad migrate [projectSlug]  (or run from a linked project directory)",
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
    ok(`Created ${result.manifestFile}`);
  } else if (result.updated) {
    ok(`Updated ${result.manifestFile}`);
  } else {
    ok(`Project metadata already present: ${result.manifestFile}`);
  }

  info(`Platform domain: ${result.platformDomain}`);
  if (result.productionDomain) {
    info(`Production domain: ${result.productionDomain}`);
  }
  info(
    "Commit `.lpad/` to git — it contains no secrets. Use `lpad env set` for production values.",
  );
}
