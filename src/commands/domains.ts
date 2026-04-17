import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { fail, info } from "../output";
import { resolveProject } from "../project";

interface Domain {
  id: string;
  hostname: string;
  type?: string;
  isActive?: boolean;
  sslEnabled?: boolean;
  sslCertExpiry?: string;
  isPrimary?: boolean;
}

export async function cmdDomainsList(
  config: Config,
  projectArg: string | undefined,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const projectSlug = resolveProject(config, projectArg);

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/domains`,
    apiUrl,
    token,
  });

  const data = extractData<{ domains?: Domain[] }>(payload);
  const domains: Domain[] = data?.domains ?? [];

  if (!domains.length) {
    info("No domains configured for this project.");
    return;
  }

  console.log();
  console.log(`  Domains for ${projectSlug}:`);
  console.log();
  for (const d of domains) {
    const ssl = d.sslEnabled ? "  SSL ✓" : "  SSL ✗";
    const primary = d.isPrimary ? "  [primary]" : "";
    const active = d.isActive === false ? "  [inactive]" : "";
    const expiry = d.sslCertExpiry
      ? `  (cert expires ${new Date(d.sslCertExpiry).toLocaleDateString()})`
      : "";
    console.log(`  ${d.hostname}${primary}${active}${ssl}${expiry}`);
  }
  console.log();
}
