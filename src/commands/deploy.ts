import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, info, warn, fail } from "../output";
import { resolveProject } from "../project";
import { lpadDirExists, scaffoldLpadDir } from "../scaffold";

interface DeploymentResponse {
  deployment?: { deploymentId?: string; id?: string; url?: string };
  deploymentId?: string;
  id?: string;
  url?: string;
}

export async function cmdDeploy(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const projectSlug = resolveProject(config, projectArg);

  if (!lpadDirExists()) {
    const bootstrapped = await scaffoldLpadDir({
      config,
      slug: projectSlug,
      apiUrl,
      token,
      fetchFromServer: true,
      updateConfig: true,
    });
    if (bootstrapped.created) {
      info(`Created ${bootstrapped.manifestFile} (auto-bootstrap on deploy)`);
    } else if (bootstrapped.updated) {
      info(`Updated ${bootstrapped.manifestFile} (auto-bootstrap on deploy)`);
    }
  }

  const body: Record<string, unknown> = {
    branch: String(flags.branch ?? "main"),
    region: String(flags.region ?? "us-east-1"),
    ssl: !flags["no-ssl"],
    cdn: Boolean(flags.cdn),
    analytics: !flags["no-analytics"],
  };

  if (flags.prod) body.isProduction = true;
  if (flags["custom-domain"])
    body.customDomain = String(flags["custom-domain"]);

  // --env KEY=VALUE (multiple allowed — args parser stores as string or string[])
  if (flags.env) {
    warn(
      "--env values (including secrets) are visible in shell history. " +
        "Use `lpad env set` for persistent secrets instead.",
    );
    const envEntries = Array.isArray(flags.env) ? flags.env : [flags.env];
    const environmentVariables: Record<string, string> = {};
    for (const entry of envEntries as string[]) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) fail(`Invalid --env value "${entry}". Expected KEY=VALUE.`);
      environmentVariables[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
    }
    body.environmentVariables = environmentVariables;
  }

  const payload = await requestJson<DeploymentResponse>({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deploy`,
    apiUrl,
    token,
    body,
  });

  const data = extractData<DeploymentResponse>(payload);
  const deployment = data.deployment ?? data;

  ok(
    `Deployment started: ${deployment.deploymentId ?? deployment.id ?? "unknown"}`,
  );
  if (deployment.url) info(`URL: ${deployment.url}`);
}
