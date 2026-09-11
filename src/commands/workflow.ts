import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, info, fail } from "../output";
import { resolveProject } from "../project";

interface Workflow {
  id: string;
  name: string;
  triggerEvent: string;
  branch: string | null;
  isActive: boolean;
  runCount: number;
}

interface WorkflowRun {
  id: string;
  status: string;
  branch: string | null;
  deploymentId: string | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

function requireAuth(config: Config): { apiUrl: string; token: string } {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token: token as string };
}

export async function cmdWorkflowList(
  config: Config,
  projectArg: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  const projectSlug = resolveProject(config, projectArg);

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/workflows`,
    apiUrl,
    token,
  });
  const workflows = extractData<Workflow[]>(payload) ?? [];

  if (!workflows.length) {
    info("No workflows found. Run `lpad workflow create <name>`.");
    return;
  }
  for (const w of workflows) {
    console.log(
      `${w.name}  ${w.triggerEvent}  branch=${w.branch ?? "main"}  runs=${w.runCount}${w.isActive ? "" : "  (disabled)"}`,
    );
  }
}

export async function cmdWorkflowCreate(
  config: Config,
  name: string | undefined,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!name) fail("Usage: lpad workflow create <name> [projectSlug] [--branch main] [--on manual|push|pull_request]");
  const projectSlug = resolveProject(config, projectArg);

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/workflows`,
    apiUrl,
    token,
    body: {
      name,
      branch: flags.branch ? String(flags.branch) : "main",
      triggerEvent: flags.on ? String(flags.on).toUpperCase() : "MANUAL",
    },
  });
  const workflow = extractData<Workflow>(payload);
  ok(`Created workflow ${workflow.name} for ${projectSlug}`);
}

export async function cmdWorkflowDispatch(
  config: Config,
  name: string | undefined,
  projectArg: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!name) fail("Usage: lpad workflow dispatch <name> [projectSlug]");
  const projectSlug = resolveProject(config, projectArg);

  const workflow = await findWorkflowByName(apiUrl, token, projectSlug, name);

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/workflows/${workflow.id}/dispatch`,
    apiUrl,
    token,
  });
  const result = extractData<{ runId: string; status: string; deploymentId?: string }>(payload);
  ok(`Dispatched ${name} — run ${result.runId} (${result.status})`);
  if (result.deploymentId) info(`Deployment: ${result.deploymentId}`);
}

export async function cmdWorkflowRuns(
  config: Config,
  name: string | undefined,
  projectArg: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!name) fail("Usage: lpad workflow runs <name> [projectSlug]");
  const projectSlug = resolveProject(config, projectArg);

  const workflow = await findWorkflowByName(apiUrl, token, projectSlug, name);

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/workflows/${workflow.id}/runs`,
    apiUrl,
    token,
  });
  const runs = extractData<WorkflowRun[]>(payload) ?? [];

  if (!runs.length) {
    info("No runs yet.");
    return;
  }
  for (const run of runs) {
    console.log(
      `${run.startedAt}  ${run.status}  ${run.deploymentId ? `deployment=${run.deploymentId}` : run.errorMessage || ""}`,
    );
  }
}

async function findWorkflowByName(
  apiUrl: string,
  token: string,
  projectSlug: string,
  name: string,
): Promise<Workflow> {
  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/workflows`,
    apiUrl,
    token,
  });
  const workflows = extractData<Workflow[]>(payload) ?? [];
  const workflow = workflows.find((w) => w.name === name);
  if (!workflow) fail(`Workflow "${name}" not found in ${projectSlug}`);
  return workflow as Workflow;
}
