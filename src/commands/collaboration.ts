import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { info, fail } from "../output";
import { resolveProject } from "../project";

interface Issue {
  number: number;
  title: string;
  state: string;
  authorLogin: string | null;
  labels: string[];
  htmlUrl: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  isMerged: boolean;
  authorLogin: string | null;
  headBranch: string;
  baseBranch: string;
  htmlUrl: string;
}

function requireAuth(config: Config): { apiUrl: string; token: string } {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token: token as string };
}

export async function cmdIssuesList(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  const projectSlug = resolveProject(config, projectArg);
  const state = flags.state ? `?state=${encodeURIComponent(String(flags.state))}` : "";

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/issues${state}`,
    apiUrl,
    token,
  });
  const data = extractData<{ issues?: Issue[]; synced?: boolean }>(payload);

  if (data.synced === false) {
    info("Project has no linked GitHub repository.");
    return;
  }
  const issues = data.issues ?? [];
  if (!issues.length) {
    info("No issues found. Run `lpad issues sync` to pull from GitHub.");
    return;
  }
  for (const issue of issues) {
    console.log(`#${issue.number}  [${issue.state}]  ${issue.title}`);
  }
}

export async function cmdIssuesSync(
  config: Config,
  projectArg: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  const projectSlug = resolveProject(config, projectArg);

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/collaboration-sync`,
    apiUrl,
    token,
  });
  const data = extractData<{ issuesSynced: number; pullRequestsSynced: number }>(payload);
  info(`Synced ${data.issuesSynced} issues, ${data.pullRequestsSynced} pull requests.`);
}

export async function cmdPullRequestsList(
  config: Config,
  projectArg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  const projectSlug = resolveProject(config, projectArg);
  const state = flags.state ? `?state=${encodeURIComponent(String(flags.state))}` : "";

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/pull-requests${state}`,
    apiUrl,
    token,
  });
  const data = extractData<{ pullRequests?: PullRequest[]; synced?: boolean }>(payload);

  if (data.synced === false) {
    info("Project has no linked GitHub repository.");
    return;
  }
  const prs = data.pullRequests ?? [];
  if (!prs.length) {
    info("No pull requests found. Run `lpad pr sync` to pull from GitHub.");
    return;
  }
  for (const pr of prs) {
    const status = pr.isMerged ? "merged" : pr.state;
    console.log(
      `#${pr.number}  [${status}]  ${pr.title}  (${pr.headBranch} -> ${pr.baseBranch})`,
    );
  }
}
