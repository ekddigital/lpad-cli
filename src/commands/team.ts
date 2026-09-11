import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, info, fail } from "../output";

interface Team {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
}

function requireAuth(config: Config): { apiUrl: string; token: string } {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token: token as string };
}

export async function cmdTeamList(
  config: Config,
  orgSlug: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!orgSlug) fail("Usage: lpad team list <orgSlug>");

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug as string)}/teams`,
    apiUrl,
    token,
  });
  const teams = extractData<Team[]>(payload) ?? [];

  if (!teams.length) {
    info("No teams found.");
    return;
  }
  for (const t of teams) {
    console.log(`${t.slug}  ${t.name}  members=${t.memberCount}`);
  }
}

export async function cmdTeamCreate(
  config: Config,
  orgSlug: string | undefined,
  name: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!orgSlug || !name)
    fail("Usage: lpad team create <orgSlug> <name> [--slug <slug>] [--description <text>]");

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug as string)}/teams`,
    apiUrl,
    token,
    body: {
      name,
      slug: flags.slug ? String(flags.slug) : undefined,
      description: flags.description ? String(flags.description) : undefined,
    },
  });
  const team = extractData<Team>(payload);
  ok(`Created team ${team.slug} (${team.name}) in ${orgSlug}`);
}

export async function cmdTeamDelete(
  config: Config,
  orgSlug: string | undefined,
  teamSlug: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!orgSlug || !teamSlug) fail("Usage: lpad team delete <orgSlug> <teamSlug>");

  await requestJson({
    method: "DELETE",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug as string)}/teams/${encodeURIComponent(teamSlug as string)}`,
    apiUrl,
    token,
  });
  ok(`Deleted team ${teamSlug} from ${orgSlug}`);
}

export async function cmdTeamMembersAdd(
  config: Config,
  orgSlug: string | undefined,
  teamSlug: string | undefined,
  userId: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!orgSlug || !teamSlug || !userId)
    fail("Usage: lpad team members add <orgSlug> <teamSlug> <userId> [--role MEMBER]");

  await requestJson({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug as string)}/teams/${encodeURIComponent(teamSlug as string)}/members`,
    apiUrl,
    token,
    body: { userId, role: String(flags.role ?? "MEMBER").toUpperCase() },
  });
  ok(`Added ${userId} to team ${teamSlug}`);
}

export async function cmdTeamMembersRemove(
  config: Config,
  orgSlug: string | undefined,
  teamSlug: string | undefined,
  userId: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!orgSlug || !teamSlug || !userId)
    fail("Usage: lpad team members remove <orgSlug> <teamSlug> <userId>");

  await requestJson({
    method: "DELETE",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug as string)}/teams/${encodeURIComponent(teamSlug as string)}/members/${encodeURIComponent(userId as string)}`,
    apiUrl,
    token,
  });
  ok(`Removed ${userId} from team ${teamSlug}`);
}
