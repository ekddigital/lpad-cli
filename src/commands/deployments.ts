import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData, sanitize } from "../http";
import { fail, info, ok, isColorEnabled } from "../output";
import { resolveProject } from "../project";

interface DeploymentSummary {
  id: string;
  status: string;
  branch?: string;
  url?: string;
  deployUrl?: string;
  createdAt?: string;
  isProduction?: boolean;
  environment?: string;
  buildTime?: number;
  commitMessage?: string;
  commitSha?: string;
  commitAuthor?: string;
}

function statusIcon(status: string): string {
  if (!isColorEnabled(process.stdout.isTTY)) return `[${status}]`;
  const map: Record<string, string> = {
    SUCCESS: "\x1b[32m✓\x1b[0m",
    READY: "\x1b[32m✓\x1b[0m",
    FAILED: "\x1b[31m✗\x1b[0m",
    ERROR: "\x1b[31m✗\x1b[0m",
    BUILDING: "\x1b[33m⟳\x1b[0m",
    PENDING: "\x1b[33m…\x1b[0m",
    CANCELLED: "\x1b[90m–\x1b[0m",
  };
  return `${map[status.toUpperCase()] ?? ""} ${status}`;
}

export async function cmdDeploymentsList(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const projectSlug = resolveProject(config, projectArg);
  const limit = flags.limit ? String(flags.limit) : "10";
  const production = flags.production ? "&production=true" : "";

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deployments?limit=${encodeURIComponent(limit)}${production}`,
    apiUrl,
    token,
  });

  const data = extractData<{ deployments?: DeploymentSummary[] }>(payload);
  const deployments: DeploymentSummary[] = data?.deployments ?? [];

  if (!deployments.length) {
    info("No deployments found.");
    return;
  }

  console.log();
  for (const d of deployments) {
    const bt = d.buildTime ? `  ${(d.buildTime / 1000).toFixed(1)}s` : "";
    const prod = d.isProduction ? "  [prod]" : "";
    const branch = d.branch ? `  ${sanitize(d.branch)}` : "";
    const url = sanitize(d.deployUrl ?? d.url ?? "");
    const sha = d.commitSha ? `  ${sanitize(d.commitSha).slice(0, 7)}` : "";
    const msg = d.commitMessage
      ? `  ${sanitize(d.commitMessage).slice(0, 60)}`
      : "";
    console.log(`  ${statusIcon(d.status)}${prod}${branch}${sha}${bt}${msg}`);
    if (url) console.log(`    ${url}`);
    console.log(`    id: ${sanitize(d.id)}`);
    console.log();
  }
}

export async function cmdDeploymentsInspect(
  config: Config,
  deploymentId: string | undefined,
  projectArg: string | undefined,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  if (!deploymentId)
    fail("Usage: lpad deployments inspect <deploymentId> [projectSlug]");

  const projectSlug = resolveProject(config, projectArg);

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deployments/${encodeURIComponent(deploymentId)}`,
    apiUrl,
    token,
  });

  const data = extractData<
    DeploymentSummary & {
      commitUrl?: string;
      errorLogs?: string;
      buildLogs?: string;
    }
  >(payload);

  if (!data) fail("Deployment not found.");

  console.log();
  console.log(`  id:          ${sanitize(data.id)}`);
  console.log(`  status:      ${statusIcon(data.status ?? "")}`);
  console.log(`  production:  ${data.isProduction ? "yes" : "no"}`);
  console.log(`  branch:      ${sanitize(data.branch ?? "")}`);
  console.log(`  environment: ${sanitize(data.environment ?? "")}`);
  if (data.deployUrl ?? data.url)
    console.log(`  url:         ${sanitize(data.deployUrl ?? data.url ?? "")}`);
  if (data.buildTime)
    console.log(`  build time:  ${(data.buildTime / 1000).toFixed(1)}s`);
  if (data.commitSha)
    console.log(
      `  commit:      ${sanitize(data.commitSha).slice(0, 7)}  ${sanitize(data.commitMessage ?? "")}`,
    );
  if (data.commitAuthor)
    console.log(`  author:      ${sanitize(data.commitAuthor)}`);
  if (data.commitUrl) console.log(`  commit url:  ${sanitize(data.commitUrl)}`);
  if (data.createdAt)
    console.log(`  created:     ${new Date(data.createdAt).toLocaleString()}`);
  if (data.errorLogs) {
    console.log();
    console.log("  error:");
    for (const line of sanitize(data.errorLogs).split("\n").slice(0, 20))
      console.log(`    ${line}`);
  }
  console.log();

  ok(`Run \`lpad logs ${projectSlug} ${data.id}\` to see build logs.`);
}
