import { type Config } from "./config";
import { readManifestFromCwd } from "./lpad-dir";
import { fail } from "./output";

/**
 * Resolve the target project slug from an explicit CLI argument, the local
 * `.lpad/manifest.json`, or the linked-project stored in global config.
 */
export function resolveProject(
  config: Config,
  arg: string | undefined,
): string {
  if (arg) return arg;

  const manifest = readManifestFromCwd();
  if (manifest?.project?.slug) {
    return manifest.project.slug;
  }

  const slug = config.linkedProject;
  if (!slug) {
    fail(
      "No project specified. Run `lpad init`, `lpad link`, or `lpad migrate`, or pass the slug explicitly.",
    );
  }
  return slug;
}
