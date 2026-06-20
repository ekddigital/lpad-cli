import fs from "node:fs";
import path from "node:path";
import {
  detectProject,
  type DetectedProject,
  type DeployMode,
  type ProjectType,
  type RuntimeHint,
} from "./detect";
import { DEFAULT_API_URL } from "./constants";

/** Current `.lpad/manifest.json` schema version. */
export const LPAD_MANIFEST_VERSION = 1;

export interface LpadEnvHint {
  key: string;
  description?: string;
  secret?: boolean;
  required?: boolean;
}

export interface LpadManifest {
  version: number;
  project: {
    slug: string;
    name?: string;
    type?: ProjectType;
  };
  lpad: {
    apiUrl: string;
    linkedAt: string;
  };
  deploy?: {
    target: "vps";
    framework?: string;
    deployMode?: DeployMode;
    runtime?: RuntimeHint;
    buildCommand?: string;
    startCommand?: string;
    outputDirectory?: string;
    platformDomain?: string;
    productionDomain?: string;
    defaultBranch?: string;
  };
  assets?: {
    publicBaseUrl?: string;
    apiBaseUrl?: string;
    clientId?: string;
    projectName?: string;
    cdnPathTemplate?: string;
  };
  env?: {
    hints?: LpadEnvHint[];
  };
  nginx?: {
    routes?: Array<{ path: string; description?: string }>;
  };
}

export const LPAD_DIR_NAME = ".lpad";
export const MANIFEST_FILE = "manifest.json";
export const README_FILE = "README.md";

export function lpadDirPath(projectRoot: string): string {
  return path.join(projectRoot, LPAD_DIR_NAME);
}

export function manifestPath(projectRoot: string): string {
  return path.join(lpadDirPath(projectRoot), MANIFEST_FILE);
}

export function findProjectRoot(startDir = process.cwd()): string | null {
  let current = path.resolve(startDir);
  const { root } = path.parse(current);

  while (true) {
    const candidate = manifestPath(current);
    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current || current === root) {
      return null;
    }
    current = parent;
  }
}

export function readManifest(projectRoot: string): LpadManifest | null {
  const filePath = manifestPath(projectRoot);
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as LpadManifest;
  } catch {
    return null;
  }
}

export function readManifestFromCwd(): LpadManifest | null {
  const root = findProjectRoot();
  return root ? readManifest(root) : null;
}

export function inferSlugFromCwd(cwd = process.cwd()): string {
  return path
    .basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function defaultAssetsHints(projectSlug: string): LpadEnvHint[] {
  return [
    {
      key: "ASSETS_API_SECRET",
      description: "Assets API secret (sk_…) — server-only Bearer token",
      secret: true,
      required: true,
    },
    {
      key: "ASSETS_BASE_URL",
      description: "Assets API origin (e.g. https://assets.andgroupco.com)",
      required: true,
    },
    {
      key: "ASSETS_PUBLIC_BASE_URL",
      description: "Public CDN origin for relative asset paths",
    },
    {
      key: "ASSETS_CLIENT_ID",
      description: `Assets client_id namespace (default: ${projectSlug})`,
    },
  ];
}

function frameworkEnvHints(
  detected: DetectedProject,
  productionDomain?: string,
): LpadEnvHint[] {
  const hints: LpadEnvHint[] = [];

  if (detected.hasPrisma) {
    hints.push({
      key: "DATABASE_URL",
      description: "Database connection string (PostgreSQL, MySQL, etc.)",
      secret: true,
      required: true,
    });
  }

  if (detected.hasNextAuth) {
    const urlHint = productionDomain
      ? `https://${productionDomain.replace(/^https?:\/\//, "")}`
      : "your production URL";
    hints.push(
      {
        key: "NEXTAUTH_URL",
        description: `Public app URL (e.g. ${urlHint})`,
        required: true,
      },
      {
        key: "NEXTAUTH_SECRET",
        description: "NextAuth session secret",
        secret: true,
        required: true,
      },
    );
  }

  if (detected.type === "python") {
    hints.push({
      key: "PORT",
      description: "HTTP port for the Python process (Launchpad sets this at deploy)",
    });
  }

  if (detected.type === "go" || detected.type === "rust") {
    hints.push({
      key: "PORT",
      description: "HTTP port for the compiled binary",
    });
  }

  return hints;
}

function mergeEnvHints(
  existing: LpadEnvHint[] | undefined,
  generated: LpadEnvHint[],
): LpadEnvHint[] {
  const byKey = new Map<string, LpadEnvHint>();
  for (const hint of generated) {
    byKey.set(hint.key, hint);
  }
  for (const hint of existing ?? []) {
    byKey.set(hint.key, hint);
  }
  return [...byKey.values()];
}

export function nginxRoutesForProject(
  detected: DetectedProject,
): LpadManifest["nginx"] {
  switch (detected.type) {
    case "nextjs":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} app — reverse-proxied to the Node process`,
          },
          {
            path: "/api/*",
            description: "Application API routes",
          },
        ],
      };
    case "node":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} server — reverse-proxied on the VPS`,
          },
          {
            path: "/api/*",
            description: "Application API routes",
          },
        ],
      };
    case "python":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} API — reverse-proxied to the Python process`,
          },
          {
            path: "/docs",
            description: "OpenAPI / Swagger docs (FastAPI)",
          },
        ],
      };
    case "static":
      return {
        routes: [
          {
            path: "/",
            description: "Static files served by nginx",
          },
        ],
      };
    case "docker":
      return {
        routes: [
          {
            path: "/",
            description: "Reverse-proxied to the Docker container",
          },
        ],
      };
    case "go":
    case "rust":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} binary — reverse-proxied on the VPS`,
          },
        ],
      };
    case "binary":
      return {
        routes: [
          {
            path: "/",
            description:
              "Custom deploy script — nginx routing may be skipped (see lpad.config.json)",
          },
        ],
      };
    default:
      return {
        routes: [
          {
            path: "/",
            description: "Reverse-proxied to the application process on the VPS",
          },
        ],
      };
  }
}

export function buildManifest(input: {
  slug: string;
  name?: string;
  apiUrl: string;
  platformDomain?: string;
  productionDomain?: string;
  defaultBranch?: string;
  assets?: LpadManifest["assets"];
  envHints?: LpadEnvHint[];
  includeAssets?: boolean;
  detected?: DetectedProject;
  projectRoot?: string;
}): LpadManifest {
  const slug = input.slug.trim();
  const platformDomain =
    input.platformDomain ?? `${slug}.lpad.ekddigital.com`;
  const detected =
    input.detected ??
    (input.projectRoot
      ? detectProject(input.projectRoot)
      : detectProject(process.cwd()));

  const frameworkHints = frameworkEnvHints(detected, input.productionDomain);
  const assetsHints =
    input.includeAssets !== false ? defaultAssetsHints(slug) : [];
  const hints = mergeEnvHints(undefined, [
    ...(input.envHints ?? []),
    ...assetsHints,
    ...frameworkHints,
  ]);

  const manifest: LpadManifest = {
    version: LPAD_MANIFEST_VERSION,
    project: {
      slug,
      type: detected.type,
      ...(input.name ? { name: input.name } : {}),
    },
    lpad: {
      apiUrl: input.apiUrl,
      linkedAt: new Date().toISOString(),
    },
    deploy: {
      target: "vps",
      framework: detected.framework,
      deployMode: detected.deployMode,
      ...(detected.runtime ? { runtime: detected.runtime } : {}),
      ...(detected.buildCommand !== undefined
        ? { buildCommand: detected.buildCommand }
        : {}),
      ...(detected.startCommand ? { startCommand: detected.startCommand } : {}),
      ...(detected.outputDirectory
        ? { outputDirectory: detected.outputDirectory }
        : {}),
      platformDomain,
      defaultBranch: input.defaultBranch ?? "main",
      ...(input.productionDomain
        ? { productionDomain: input.productionDomain }
        : {}),
    },
  };

  if (input.includeAssets !== false) {
    manifest.assets = {
      publicBaseUrl: "https://assets.andgroupco.com",
      apiBaseUrl: "https://assets.andgroupco.com/api/v1",
      clientId: slug,
      projectName: slug,
      cdnPathTemplate:
        "/assets/{clientId}/{projectName}/{assetType}/{filename}",
      ...input.assets,
    };
  }

  if (hints.length > 0) {
    manifest.env = { hints };
  }

  manifest.nginx = nginxRoutesForProject(detected);

  return manifest;
}

export function readmeContent(
  manifest?: Pick<LpadManifest, "deploy" | "project">,
): string {
  const slug = manifest?.project?.slug ?? "{slug}";
  const projectType = manifest?.project?.type ?? "unknown";
  const framework = manifest?.deploy?.framework ?? "application";
  const platformDomain =
    manifest?.deploy?.platformDomain ?? `${slug}.lpad.ekddigital.com`;
  const productionDomain = manifest?.deploy?.productionDomain;
  const deployMode = manifest?.deploy?.deployMode ?? "pm2";

  const deploySection =
    deployMode === "static"
      ? `This **${framework}** project deploys as **static files** via nginx on the VPS.`
      : deployMode === "docker"
        ? `This **${framework}** project deploys via **Docker** on the VPS.`
        : deployMode === "script" || deployMode === "systemd"
          ? `This project uses **${deployMode}** deploy mode — see \`lpad.config.json\` for overrides.`
          : projectType === "python" ||
              projectType === "go" ||
              projectType === "rust"
            ? `This **${framework}** project deploys as a **long-running process** on the VPS (nginx reverse proxy).`
            : `This **${framework}** project deploys to **VPS via Launchpad** (nginx + PM2/Docker), not Vercel.`;

  const domainLines = [
    `- Platform URL: \`${platformDomain}\``,
    ...(productionDomain ? [`- Production URL: \`${productionDomain}\``] : []),
  ].join("\n");

  return `# .lpad — Launchpad project metadata

This directory is created automatically by \`lpad init\`, \`lpad link\`, \`lpad migrate\`, or the first \`lpad deploy\` when missing.
**Do not create or edit these files manually** — re-run the CLI to refresh metadata.
It is **safe to commit** — it contains no secrets.

## Files

| File | Purpose |
|------|---------|
| \`manifest.json\` | Project slug, type, linked Launchpad instance, deploy hints, assets URL templates, env hints |
| \`README.md\` | This file (generated by the CLI) |

## What belongs here vs elsewhere

| Location | Contents |
|----------|----------|
| \`.lpad/manifest.json\` | Non-secret metadata: slug, project type, domains, build hints, env **hints** |
| \`lpad.config.json\` (repo root) | Deploy overrides: \`deployMode\`, build commands, runtime env defaults |
| Launchpad dashboard / \`lpad env set\` | Production secrets and environment variables |
| \`~/.config/lpad/config.json\` | CLI auth token and global defaults |

## Deploy target

${deploySection}

${domainLines}

## Assets CDN (optional)

When integrating [EKD Digital Assets](https://assets.andgroupco.com), use:

- **Persist / store:** \`/api/v1/assets/{id}/download\` (canonical API URL)
- **Browser preview:** \`/api/v1/assets/{id}/download?preview=true\`
- **Legacy CDN path:** \`/assets/{clientId}/{projectName}/…/{uuid}.ext\` — nginx on the Assets VPS may serve files directly; the Assets app also redirects these to the download API.

Set secrets via \`lpad env set\` — never commit \`sk_…\` keys.

## Commands

\`\`\`bash
lpad migrate              # refresh .lpad/ from Launchpad API + local detection
lpad deploy --prod
lpad env pull --environment production
lpad domains ${slug}
\`\`\`
`;
}

export function writeLpadDir(
  projectRoot: string,
  manifest: LpadManifest,
  options?: { force?: boolean },
): { created: boolean; updated: boolean } {
  const dir = lpadDirPath(projectRoot);
  const manifestFile = manifestPath(projectRoot);
  const readmeFile = path.join(dir, README_FILE);

  const manifestExists = fs.existsSync(manifestFile);
  if (manifestExists && !options?.force) {
    const existing = readManifest(projectRoot);
    const merged: LpadManifest = {
      ...existing,
      ...manifest,
      project: { ...existing?.project, ...manifest.project },
      lpad: {
        ...existing?.lpad,
        ...manifest.lpad,
        linkedAt: manifest.lpad.linkedAt,
      },
      deploy: {
        target: "vps",
        ...existing?.deploy,
        ...manifest.deploy,
      },
      assets: { ...existing?.assets, ...manifest.assets },
      env: {
        hints: mergeEnvHints(existing?.env?.hints, manifest.env?.hints ?? []),
      },
      nginx: manifest.nginx ?? existing?.nginx,
    };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      manifestFile,
      JSON.stringify(merged, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(readmeFile, readmeContent(merged), "utf8");
    return { created: false, updated: true };
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    manifestFile,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  fs.writeFileSync(readmeFile, readmeContent(manifest), "utf8");
  return { created: !manifestExists, updated: manifestExists };
}

export function defaultApiUrlForManifest(apiUrl?: string): string {
  return apiUrl ?? process.env.LPAD_API_URL ?? DEFAULT_API_URL;
}
