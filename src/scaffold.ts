import fs from "node:fs";
import { type Config, writeConfig } from "./config";
import { detectProject } from "./detect";
import { requestJson, extractData } from "./http";
import {
  buildManifest,
  manifestPath,
  writeLpadDir,
} from "./lpad-dir";

interface ProjectBlock {
  slug?: string;
  name?: string;
  repository?: { branch?: string; default_branch?: string };
}

interface ProjectSettingsResponse {
  project?: ProjectBlock;
  settings?: ProjectBlock;
  slug?: string;
  name?: string;
}

interface DomainEntry {
  domain?: string;
  isActive?: boolean;
  isVerified?: boolean;
}

interface DomainsResponse {
  domains?: DomainEntry[];
}

export interface ScaffoldOptions {
  config: Config;
  slug: string;
  apiUrl: string;
  token?: string;
  cwd?: string;
  force?: boolean;
  includeAssets?: boolean;
  /** When true (default if token present), enrich manifest from Launchpad API. */
  fetchFromServer?: boolean;
  /** Update global CLI config linkedProject + apiUrl. */
  updateConfig?: boolean;
}

export interface ScaffoldResult {
  created: boolean;
  updated: boolean;
  manifestFile: string;
  slug: string;
  platformDomain: string;
  productionDomain?: string;
}

async function fetchProjectMetadata(
  apiUrl: string,
  token: string,
  slug: string,
): Promise<{
  projectName?: string;
  defaultBranch: string;
  platformDomain: string;
  productionDomain?: string;
  foundOnServer: boolean;
}> {
  let projectName: string | undefined;
  let defaultBranch = "main";
  let platformDomain = `${slug}.lpad.ekddigital.com`;
  let productionDomain: string | undefined;
  let foundOnServer = false;

  try {
    const settingsPayload = await requestJson<ProjectSettingsResponse>({
      method: "GET",
      pathName: `/api/projects/${encodeURIComponent(slug)}/settings`,
      apiUrl,
      token,
    });
    const settings = extractData<ProjectSettingsResponse>(settingsPayload);
    const projectBlock: ProjectBlock | undefined =
      settings.project ?? settings.settings;
    projectName = projectBlock?.name ?? settings.name;
    defaultBranch =
      projectBlock?.repository?.branch ??
      projectBlock?.repository?.default_branch ??
      defaultBranch;
    foundOnServer = true;
  } catch {
    // Project may not exist on Launchpad yet — local scaffold only.
  }

  try {
    const domainsPayload = await requestJson<DomainsResponse>({
      method: "GET",
      pathName: `/api/projects/${encodeURIComponent(slug)}/domains`,
      apiUrl,
      token,
    });
    const domainsData = extractData<DomainsResponse>(domainsPayload);
    const activeDomains = (domainsData.domains ?? []).filter(
      (d) => d.isActive !== false && d.isVerified !== false,
    );
    const custom = activeDomains.find(
      (d) => d.domain && !d.domain.endsWith(".lpad.ekddigital.com"),
    );
    if (custom?.domain) {
      productionDomain = custom.domain;
    }
    const platform = activeDomains.find((d) =>
      d.domain?.endsWith(".lpad.ekddigital.com"),
    );
    if (platform?.domain) {
      platformDomain = platform.domain;
    }
  } catch {
    // Domains are optional.
  }

  return {
    projectName,
    defaultBranch,
    platformDomain,
    productionDomain,
    foundOnServer,
  };
}

/**
 * Create or merge `.lpad/manifest.json` for a project directory.
 * Idempotent: existing manifests are merged, not replaced (unless `force`).
 */
export async function scaffoldLpadDir(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const cwd = options.cwd ?? process.cwd();
  const slug = options.slug.trim();
  const includeAssets = options.includeAssets !== false;
  const fetchFromServer =
    options.fetchFromServer ?? Boolean(options.token?.trim());

  let projectName: string | undefined;
  let defaultBranch = "main";
  let platformDomain = `${slug}.lpad.ekddigital.com`;
  let productionDomain: string | undefined;

  if (fetchFromServer && options.token) {
    const meta = await fetchProjectMetadata(
      options.apiUrl,
      options.token,
      slug,
    );
    projectName = meta.projectName;
    defaultBranch = meta.defaultBranch;
    platformDomain = meta.platformDomain;
    productionDomain = meta.productionDomain;
  }

  const detected = detectProject(cwd);

  const manifest = buildManifest({
    slug,
    name: projectName,
    apiUrl: options.apiUrl,
    platformDomain,
    productionDomain,
    defaultBranch,
    includeAssets,
    detected,
    projectRoot: cwd,
  });

  const { created, updated } = writeLpadDir(cwd, manifest, {
    force: options.force,
  });

  if (options.updateConfig !== false) {
    writeConfig({
      ...options.config,
      linkedProject: slug,
      apiUrl: options.apiUrl,
    });
  }

  return {
    created,
    updated,
    manifestFile: manifestPath(cwd),
    slug,
    platformDomain,
    productionDomain,
  };
}

export function lpadDirExists(cwd = process.cwd()): boolean {
  return fs.existsSync(manifestPath(cwd));
}