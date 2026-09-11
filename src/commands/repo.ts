import { spawn } from "node:child_process";
import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, info, fail } from "../output";

interface HostedRepo {
  slug: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
  cloneUrl: string;
}

function requireAuth(config: Config): { apiUrl: string; token: string } {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token: token as string };
}

function splitOrgRepo(arg: string | undefined, usage: string): [string, string?] {
  if (!arg) fail(usage);
  const [org, repo] = (arg as string).split("/");
  if (!org) fail(usage);
  return [org, repo];
}

export async function cmdRepoList(
  config: Config,
  orgSlug: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!orgSlug) fail("Usage: lpad repo list <orgSlug>");

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/repos`,
    apiUrl,
    token,
  });
  const repos = extractData<HostedRepo[]>(payload) ?? [];

  if (!repos.length) {
    info("No repositories found. Run `lpad repo create <orgSlug>/<name>`.");
    return;
  }
  for (const repo of repos) {
    console.log(`${repo.slug}  ${repo.isPrivate ? "private" : "public"}  ${repo.cloneUrl}`);
  }
}

export async function cmdRepoCreate(
  config: Config,
  arg: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  const [orgSlug, repoName] = splitOrgRepo(
    arg,
    "Usage: lpad repo create <orgSlug>/<name> [--description <text>] [--public] [--branch main]",
  );
  if (!repoName) fail("Usage: lpad repo create <orgSlug>/<name>");

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/repos`,
    apiUrl,
    token,
    body: {
      name: repoName,
      description: flags.description ? String(flags.description) : undefined,
      isPrivate: !flags.public,
      defaultBranch: flags.branch ? String(flags.branch) : "main",
    },
  });
  const repo = extractData<HostedRepo>(payload);
  ok(`Created ${orgSlug}/${repo.slug}`);
  console.log(repo.cloneUrl);
}

export async function cmdRepoClone(
  config: Config,
  arg: string | undefined,
  dir: string | undefined,
): Promise<void> {
  const { apiUrl } = requireAuth(config);
  const [orgSlug, repoSlug] = splitOrgRepo(arg, "Usage: lpad repo clone <orgSlug>/<repoSlug> [dir]");
  if (!repoSlug) fail("Usage: lpad repo clone <orgSlug>/<repoSlug> [dir]");

  const cloneUrl = `${apiUrl.replace(/\/$/, "")}/git/${orgSlug}/${repoSlug}.git`;
  const args = dir ? [cloneUrl, dir] : [cloneUrl];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["clone", ...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`git clone exited ${code}`))));
  });
}
