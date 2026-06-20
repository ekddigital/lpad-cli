import fs from "node:fs";
import path from "node:path";

/** High-level project category stored in manifest `project.type`. */
export type ProjectType =
  | "nextjs"
  | "node"
  | "static"
  | "python"
  | "go"
  | "rust"
  | "docker"
  | "binary"
  | "unknown";

export type DeployMode =
  | "pm2"
  | "script"
  | "systemd"
  | "static"
  | "process"
  | "docker";

export type RuntimeHint = "node" | "python" | "go" | "rust" | "binary";

export interface DetectedProject {
  type: ProjectType;
  framework: string;
  deployMode: DeployMode;
  runtime?: RuntimeHint;
  buildCommand?: string;
  startCommand?: string;
  outputDirectory?: string;
  hasPrisma: boolean;
  hasNextAuth: boolean;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

function fileExists(root: string, ...parts: string[]): boolean {
  return fs.existsSync(path.join(root, ...parts));
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function readTextFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function packageJson(root: string): PackageJson | null {
  return readJsonFile<PackageJson>(path.join(root, "package.json"));
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function scriptOr(
  pkg: PackageJson | null,
  script: string,
  fallback: string,
): string {
  return pkg?.scripts?.[script]?.trim() || fallback;
}

function detectPython(root: string): DetectedProject | null {
  const hasManage = fileExists(root, "manage.py");
  const hasPyproject = fileExists(root, "pyproject.toml");
  const hasReqs = fileExists(root, "requirements.txt");
  if (!hasManage && !hasPyproject && !hasReqs) return null;

  let framework = "Python";
  let startCommand = "python3 -m uvicorn main:app --host 0.0.0.0 --port $PORT";

  if (hasManage) {
    framework = "Django";
    startCommand = "python3 manage.py runserver 0.0.0.0:$PORT";
  } else if (hasPyproject) {
    const toml = readTextFile(path.join(root, "pyproject.toml")) ?? "";
    if (/fastapi/i.test(toml)) {
      framework = "FastAPI";
      startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT";
    } else if (/flask/i.test(toml)) {
      framework = "Flask";
      startCommand = "python3 -m flask run --host=0.0.0.0 --port=$PORT";
    }
  } else if (hasReqs) {
    const reqs = readTextFile(path.join(root, "requirements.txt")) ?? "";
    if (/^fastapi/im.test(reqs)) {
      framework = "FastAPI";
      startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT";
    } else if (/^flask/im.test(reqs)) {
      framework = "Flask";
      startCommand = "python3 -m flask run --host=0.0.0.0 --port=$PORT";
    } else if (/^django/im.test(reqs)) {
      framework = "Django";
      startCommand = "python3 manage.py runserver 0.0.0.0:$PORT";
    }
  }

  return {
    type: "python",
    framework,
    deployMode: "process",
    runtime: "python",
    buildCommand: "",
    startCommand,
    outputDirectory: ".",
    hasPrisma: false,
    hasNextAuth: false,
  };
}

function detectGo(root: string): DetectedProject | null {
  if (!fileExists(root, "go.mod")) return null;
  return {
    type: "go",
    framework: "Go",
    deployMode: "process",
    runtime: "go",
    buildCommand: "go build -o bin/app .",
    startCommand: "./bin/app",
    outputDirectory: "bin",
    hasPrisma: false,
    hasNextAuth: false,
  };
}

function detectRust(root: string): DetectedProject | null {
  if (!fileExists(root, "Cargo.toml")) return null;
  return {
    type: "rust",
    framework: "Rust",
    deployMode: "process",
    runtime: "rust",
    buildCommand: "cargo build --release",
    startCommand: "./target/release/app",
    outputDirectory: "target/release",
    hasPrisma: false,
    hasNextAuth: false,
  };
}

function detectDocker(root: string): DetectedProject | null {
  const hasDockerfile = fileExists(root, "Dockerfile");
  const hasCompose =
    fileExists(root, "docker-compose.yml") ||
    fileExists(root, "docker-compose.yaml") ||
    fileExists(root, "compose.yml") ||
    fileExists(root, "compose.yaml");
  if (!hasDockerfile && !hasCompose) return null;

  return {
    type: "docker",
    framework: hasDockerfile ? "Docker" : "Docker Compose",
    deployMode: "docker",
    buildCommand: hasDockerfile ? "docker build -t app ." : undefined,
    startCommand: hasCompose ? "docker compose up -d" : "docker run app",
    hasPrisma: false,
    hasNextAuth: false,
  };
}

function detectNode(root: string, pkg: PackageJson): DetectedProject | null {
  if (hasDep(pkg, "next")) {
    const hasPrisma =
      hasDep(pkg, "@prisma/client") ||
      hasDep(pkg, "prisma") ||
      fileExists(root, "prisma", "schema.prisma");
    const hasNextAuth = hasDep(pkg, "next-auth");

    return {
      type: "nextjs",
      framework: "Next.js",
      deployMode: "pm2",
      runtime: "node",
      buildCommand: scriptOr(pkg, "build", "npm run build"),
      startCommand: scriptOr(pkg, "start", "npm start"),
      outputDirectory: ".next",
      hasPrisma,
      hasNextAuth,
    };
  }

  if (hasDep(pkg, "vite") || hasDep(pkg, "react-scripts")) {
    const isCra = hasDep(pkg, "react-scripts");
    return {
      type: "static",
      framework: isCra ? "Create React App" : "Vite",
      deployMode: "static",
      runtime: "node",
      buildCommand: scriptOr(pkg, "build", "npm run build"),
      outputDirectory: isCra ? "build" : "dist",
      hasPrisma: false,
      hasNextAuth: false,
    };
  }

  if (hasDep(pkg, "express") || hasDep(pkg, "fastify") || hasDep(pkg, "@nestjs/core")) {
    let framework = "Node.js";
    if (hasDep(pkg, "express")) framework = "Express";
    else if (hasDep(pkg, "fastify")) framework = "Fastify";
    else if (hasDep(pkg, "@nestjs/core")) framework = "NestJS";

    return {
      type: "node",
      framework,
      deployMode: "pm2",
      runtime: "node",
      buildCommand: scriptOr(pkg, "build", "npm run build"),
      startCommand: scriptOr(pkg, "start", "node index.js"),
      hasPrisma:
        hasDep(pkg, "@prisma/client") ||
        hasDep(pkg, "prisma") ||
        fileExists(root, "prisma", "schema.prisma"),
      hasNextAuth: false,
    };
  }

  if (pkg.scripts?.start || pkg.scripts?.build) {
    return {
      type: "node",
      framework: "Node.js",
      deployMode: "pm2",
      runtime: "node",
      buildCommand: pkg.scripts.build,
      startCommand: scriptOr(pkg, "start", "npm start"),
      hasPrisma:
        hasDep(pkg, "@prisma/client") ||
        hasDep(pkg, "prisma") ||
        fileExists(root, "prisma", "schema.prisma"),
      hasNextAuth: hasDep(pkg, "next-auth"),
    };
  }

  return null;
}

function detectStaticSite(root: string): DetectedProject | null {
  const hasIndex = fileExists(root, "index.html");
  const hasPublic = fileExists(root, "public", "index.html");
  if (!hasIndex && !hasPublic) return null;
  if (packageJson(root)) return null;

  return {
    type: "static",
    framework: "Static HTML",
    deployMode: "static",
    outputDirectory: hasPublic ? "public" : ".",
    hasPrisma: false,
    hasNextAuth: false,
  };
}

function detectLpadConfig(root: string): DetectedProject | null {
  const config = readJsonFile<{
    type?: string;
    deployMode?: DeployMode;
    runtime?: RuntimeHint;
    deployScript?: string;
  }>(path.join(root, "lpad.config.json"));
  if (!config) return null;

  if (config.runtime === "binary" || config.deployMode === "script") {
    return {
      type: "binary",
      framework: config.type ?? "Custom script",
      deployMode: config.deployMode ?? "script",
      runtime: config.runtime ?? "binary",
      startCommand: config.deployScript,
      hasPrisma: false,
      hasNextAuth: false,
    };
  }

  return null;
}

const FALLBACK: DetectedProject = {
  type: "unknown",
  framework: "Unknown",
  deployMode: "pm2",
  hasPrisma: false,
  hasNextAuth: false,
};

/**
 * Inspect a project directory and infer type, framework, and deploy hints.
 * Used when scaffolding `.lpad/manifest.json` — not a full deploy pipeline.
 */
export function detectProject(projectRoot: string): DetectedProject {
  const root = path.resolve(projectRoot);

  const fromConfig = detectLpadConfig(root);
  if (fromConfig) return fromConfig;

  const pkg = packageJson(root);
  if (pkg) {
    const node = detectNode(root, pkg);
    if (node) return node;
  }

  const detectors = [
    () => detectPython(root),
    () => detectGo(root),
    () => detectRust(root),
    () => detectDocker(root),
    () => detectStaticSite(root),
  ];

  for (const run of detectors) {
    const result = run();
    if (result) return result;
  }

  return FALLBACK;
}
