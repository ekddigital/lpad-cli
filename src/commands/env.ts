import fs from "node:fs";
import path from "node:path";
import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, info, fail } from "../output";
import { resolveProject } from "../project";

interface EnvVar {
  key: string;
  value: string;
  environment?: string;
}

export async function cmdEnvPull(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const projectSlug = resolveProject(config, projectArg);
  const envName = String(flags.environment ?? "production").toLowerCase();
  const output = String(flags.output ?? `.env.${envName}`);

  const payload = await requestJson<{ variables?: EnvVar[] }>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
    apiUrl,
    token,
  });

  const data = extractData<{ variables?: EnvVar[] }>(payload);
  const vars: EnvVar[] = Array.isArray(data.variables) ? data.variables : [];

  const lines = vars
    .filter((v) => {
      const env = String(v.environment ?? "").toLowerCase();
      return env === envName || env === "all";
    })
    .map((v) => `${v.key}=${String(v.value).replace(/\n/g, "\\n")}`);

  fs.writeFileSync(
    path.resolve(output),
    lines.join("\n") + (lines.length ? "\n" : ""),
    "utf8",
  );
  ok(`Wrote ${lines.length} variable(s) to ${output}`);
}

export async function cmdEnvSet(
  config: Config,
  args: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const [projectMaybe, keyMaybe, valueMaybe] = args;
  let projectSlug = config.linkedProject;
  let key = keyMaybe;
  let value = valueMaybe;

  if (args.length >= 3) {
    projectSlug = projectMaybe;
  } else if (args.length === 2) {
    key = projectMaybe;
    value = keyMaybe;
  }

  if (!projectSlug) {
    fail(
      "No project specified. Use `lpad link <projectSlug>` or pass it explicitly.",
    );
  }

  if (!key || value === undefined) {
    fail(
      "Usage: lpad env set [projectSlug] <KEY> <VALUE> [--environment production] [--secret]",
    );
  }

  const body = {
    key: String(key),
    value: String(value),
    environment: String(flags.environment ?? "production"),
    isSecret: Boolean(flags.secret),
    description: flags.description ? String(flags.description) : undefined,
  };

  await requestJson({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug as string)}/environment`,
    apiUrl,
    token,
    body,
  });

  ok(`Saved ${key} for ${projectSlug} (${body.environment})`);
}

export async function cmdEnvList(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const projectSlug = resolveProject(config, projectArg);
  const envFilter = flags.environment ? String(flags.environment).toLowerCase() : null;

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
    apiUrl,
    token,
  });

  const data = extractData<{ variables?: Array<{
    id: string;
    key: string;
    value: string;
    environment?: string;
    isSecret?: boolean;
    description?: string;
  }> }>(payload);

  const vars = (data?.variables ?? []).filter((v) => {
    if (!envFilter) return true;
    const env = String(v.environment ?? "").toLowerCase();
    return env === envFilter || env === "all";
  });

  if (!vars.length) {
    info("No environment variables found.");
    return;
  }

  const label = envFilter ? ` (${envFilter})` : "";
  console.log();
  console.log(`  Environment variables for ${projectSlug}${label}:`);
  console.log();
  for (const v of vars) {
    const secret = v.isSecret ? "  [secret]" : "";
    const env = v.environment ? `  (${v.environment})` : "";
    const displayValue = v.isSecret ? "●●●●●●●●" : v.value;
    console.log(`  ${v.key}=${displayValue}${secret}${env}`);
  }
  console.log();
}
