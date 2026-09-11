import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, info, fail } from "../output";

interface OrganizationSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  role: string | null;
  stats: { members: number; teams: number; projects: number };
}

interface OrganizationDetail extends OrganizationSummary {
  ownerId: string;
  createdAt: string;
}

interface Member {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

function requireAuth(config: Config): { apiUrl: string; token: string } {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token: token as string };
}

export async function cmdOrgList(config: Config): Promise<void> {
  const { apiUrl, token } = requireAuth(config);

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: "/api/organizations",
    apiUrl,
    token,
  });
  const orgs = extractData<OrganizationSummary[]>(payload) ?? [];

  if (!orgs.length) {
    info("No organizations found.");
    return;
  }

  for (const org of orgs) {
    const role = org.role ? ` (${org.role})` : "";
    console.log(
      `${org.slug}  ${org.name}${role}  members=${org.stats.members} teams=${org.stats.teams} projects=${org.stats.projects}`,
    );
  }
}

export async function cmdOrgCreate(
  config: Config,
  name: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);

  if (!name) fail("Usage: lpad org create <name> [--slug <slug>] [--description <text>]");

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: "/api/organizations",
    apiUrl,
    token,
    body: {
      name,
      slug: flags.slug ? String(flags.slug) : undefined,
      description: flags.description ? String(flags.description) : undefined,
    },
  });
  const org = extractData<OrganizationDetail>(payload);
  ok(`Created organization ${org.slug} (${org.name})`);
}

export async function cmdOrgShow(
  config: Config,
  slug: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!slug) fail("Usage: lpad org show <orgSlug>");

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(slug as string)}`,
    apiUrl,
    token,
  });
  const org = extractData<OrganizationDetail>(payload);

  console.log(`${org.name}  (@${org.slug})`);
  if (org.description) console.log(org.description);
  console.log(
    `role=${org.role}  members=${org.stats.members}  teams=${org.stats.teams}  projects=${org.stats.projects}`,
  );
}

export async function cmdOrgMembersList(
  config: Config,
  slug: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!slug) fail("Usage: lpad org members list <orgSlug>");

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(slug as string)}/members`,
    apiUrl,
    token,
  });
  const members = extractData<Member[]>(payload) ?? [];

  if (!members.length) {
    info("No members found.");
    return;
  }
  for (const m of members) {
    console.log(`${m.email}  ${m.role}  ${m.name ?? ""}`.trimEnd());
  }
}

export async function cmdOrgMembersAdd(
  config: Config,
  slug: string | undefined,
  email: string | undefined,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!slug || !email)
    fail("Usage: lpad org members add <orgSlug> <email> [--role VIEWER]");

  const payload = await requestJson<unknown>({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(slug as string)}/members`,
    apiUrl,
    token,
    body: { email, role: String(flags.role ?? "VIEWER").toUpperCase() },
  });
  const member = extractData<Member>(payload);
  ok(`Added ${member.email} as ${member.role} to ${slug}`);
}

export async function cmdOrgMembersRole(
  config: Config,
  slug: string | undefined,
  userId: string | undefined,
  role: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!slug || !userId || !role)
    fail("Usage: lpad org members role <orgSlug> <userId> <role>");

  await requestJson({
    method: "PATCH",
    pathName: `/api/organizations/${encodeURIComponent(slug as string)}/members/${encodeURIComponent(userId as string)}`,
    apiUrl,
    token,
    body: { role: String(role).toUpperCase() },
  });
  ok(`Updated role for ${userId} to ${String(role).toUpperCase()}`);
}

export async function cmdOrgMembersRemove(
  config: Config,
  slug: string | undefined,
  userId: string | undefined,
): Promise<void> {
  const { apiUrl, token } = requireAuth(config);
  if (!slug || !userId) fail("Usage: lpad org members remove <orgSlug> <userId>");

  await requestJson({
    method: "DELETE",
    pathName: `/api/organizations/${encodeURIComponent(slug as string)}/members/${encodeURIComponent(userId as string)}`,
    apiUrl,
    token,
  });
  ok(`Removed ${userId} from ${slug}`);
}
