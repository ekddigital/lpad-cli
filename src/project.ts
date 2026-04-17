import { type Config } from "./config";
import { fail } from "./output";

/**
 * Resolve the target project slug from an explicit CLI argument or the
 * linked-project stored in config. Shared by deploy and env commands.
 */
export function resolveProject(
  config: Config,
  arg: string | undefined,
): string {
  const slug = arg ?? config.linkedProject;
  if (!slug) {
    fail(
      "No project specified. Use `lpad link <projectSlug>` or pass the slug explicitly.",
    );
  }
  return slug as string;
}
