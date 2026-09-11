#!/usr/bin/env node

// src/constants.ts
var VERSION = "0.2.0";
var DEFAULT_API_URL = "https://lpad.ekddigital.com";
var CONFIG_DIR = process.env.LPAD_CONFIG_DIR ?? (process.env.XDG_CONFIG_HOME ? `${process.env.XDG_CONFIG_HOME}/lpad` : `${process.env.HOME ?? ""}/.config/lpad`);
var CONFIG_PATH = `${CONFIG_DIR}/config.json`;

// src/args.ts
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("-")) {
      positional.push(token);
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
      continue;
    }
    const short = token.slice(1);
    if (short === "v") {
      flags.version = true;
      continue;
    }
    if (short === "h") {
      flags.help = true;
      continue;
    }
    flags[short] = true;
  }
  return { positional, flags };
}

// src/config.ts
import fs from "node:fs";
function ensureConfigDir() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}
function writeConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf8",
    mode: 384
  });
  try {
    fs.chmodSync(CONFIG_PATH, 384);
  } catch {
  }
}
function getApiUrl(config) {
  return process.env.LPAD_API_URL ?? config.apiUrl ?? DEFAULT_API_URL;
}
function getToken(config) {
  return process.env.LPAD_TOKEN ?? config.token ?? "";
}

// src/output.ts
function isColorEnabled(isTTY) {
  if (process.env.NO_COLOR !== void 0 && process.env.NO_COLOR !== "")
    return false;
  if (process.env.TERM === "dumb") return false;
  return isTTY === true;
}
function color(code, text) {
  if (!isColorEnabled(process.stderr.isTTY)) return text;
  return `\x1B[${code}m${text}\x1B[0m`;
}
function ok(msg) {
  process.stderr.write(`${color("32", "OK")}: ${msg}
`);
}
function info(msg) {
  process.stderr.write(`${color("34", "->")}: ${msg}
`);
}
function warn(msg) {
  process.stderr.write(`${color("33", "!")}: ${msg}
`);
}
function fail(msg, code = 1) {
  process.stderr.write(`${color("31", "ERR")}: ${msg}
`);
  process.exit(code);
}

// src/commands/login.ts
import readline from "node:readline";
import { Writable } from "node:stream";
import { spawn } from "node:child_process";

// src/http.ts
function sanitize(s) {
  return s.replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07)/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}
function assertSecureTransport(url, hasToken) {
  if (!hasToken) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid API URL: "${url}"`);
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocal) {
    throw new Error(
      `Refusing to send credentials over plain HTTP to "${parsed.host}". Set the API URL to an HTTPS endpoint or use LPAD_API_URL.`
    );
  }
}
async function requestJson(opts) {
  const url = `${opts.apiUrl.replace(/\/$/, "")}${opts.pathName}`;
  assertSecureTransport(url, Boolean(opts.token));
  const headers = {
    "Content-Type": "application/json",
    // Sent with every request so server logs can identify the CLI version.
    // Recommended by 12-factor CLI apps §3.
    "User-Agent": `lpad-cli/${VERSION}`
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const timeoutMs = opts.timeoutMs ?? 3e4;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0,
      signal: controller?.signal
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${timeoutMs / 1e3}s. Check your network or API URL.`
      );
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data;
    throw new Error(err?.message ?? err?.error ?? `HTTP ${res.status}`);
  }
  return data;
}
function extractData(payload) {
  if (payload !== null && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }
  return payload;
}

// src/commands/login.ts
function openBrowser(url) {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      stdio: "ignore",
      detached: true
    }).unref();
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function loginWithGitHub(config, apiUrl) {
  const startPayload = await requestJson({
    method: "POST",
    pathName: "/api/auth/github/device/start",
    apiUrl
  });
  const start = extractData(startPayload);
  ok("Starting GitHub device login...");
  process.stdout.write(
    `Open ${start.verificationUri} and enter code: ${start.userCode}
`
  );
  try {
    openBrowser(start.verificationUri);
  } catch {
    warn("Could not open browser automatically. Please open the URL manually.");
  }
  const pollIntervalMs = Math.max(3, start.interval) * 1e3;
  const expiresAt = Date.now() + start.expiresIn * 1e3;
  while (Date.now() < expiresAt) {
    const completePayload = await requestJson({
      method: "POST",
      pathName: "/api/auth/github/device/complete",
      apiUrl,
      body: { deviceCode: start.deviceCode }
    });
    const complete = extractData(completePayload);
    if (complete.status === "approved" && complete.token) {
      writeConfig({
        ...config,
        token: complete.token,
        apiUrl,
        user: complete.user ?? null
      });
      ok(`Logged in${complete.user?.email ? ` as ${complete.user.email}` : ""}.`);
      return;
    }
    await sleep(pollIntervalMs);
  }
  fail("GitHub login timed out. Please run `lpad login --github` again.");
}
async function readHiddenInput(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }
  return new Promise((resolve) => {
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!mutableStdout.muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      }
    });
    mutableStdout.muted = false;
    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true
    });
    process.stdout.write(prompt);
    mutableStdout.muted = true;
    rl.question("", (answer) => {
      mutableStdout.muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}
async function cmdLogin(config, flags) {
  const apiUrl = String(flags.api ?? getApiUrl(config));
  if (flags.token) {
    writeConfig({ ...config, token: String(flags.token), apiUrl });
    ok("Token saved.");
    return;
  }
  if (flags.github) {
    await loginWithGitHub(config, apiUrl);
    return;
  }
  if (!flags.email) fail("Use --email and --password, or --token.");
  if (flags.password) {
    warn(
      "--password is visible in shell history and process lists (ps aux). Omit it to be prompted securely instead."
    );
  }
  const password = flags.password ? String(flags.password) : await readHiddenInput("Password: ");
  if (!password) fail("Password is required.");
  const payload = await requestJson({
    method: "POST",
    pathName: "/api/auth/login",
    apiUrl,
    body: { email: String(flags.email), password }
  });
  const data = extractData(payload);
  const token = data?.token;
  if (!token) fail("Login succeeded but no token returned by API.");
  writeConfig({ ...config, token, apiUrl, user: data.user ?? null });
  ok(`Logged in${data?.user?.email ? ` as ${data.user.email}` : ""}.`);
}

// src/commands/whoami.ts
async function cmdWhoami(config) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const payload = await requestJson({
    method: "GET",
    pathName: "/api/auth/me",
    apiUrl,
    token
  });
  const data = extractData(payload);
  const user = data.user ?? data;
  console.log(`email: ${user.email ?? "unknown"}`);
  console.log(`name:  ${user.name ?? ""}`);
  console.log(`role:  ${user.role ?? ""}`);
}

// src/commands/logout.ts
function cmdLogout(config) {
  const { token: _t, user: _u, ...rest } = config;
  writeConfig(rest);
  ok("Logged out.");
}

// src/commands/projects.ts
function normalizeProjects(payload) {
  if (Array.isArray(payload)) {
    return {
      projects: payload,
      hasNextPage: false,
      page: 1,
      totalPages: 1
    };
  }
  const projects = payload.projects ?? [];
  const page = payload.pagination?.page ?? 1;
  const totalPages = payload.pagination?.totalPages ?? 1;
  const hasNextPage = payload.pagination?.hasNextPage ?? page < totalPages;
  return { projects, hasNextPage, page, totalPages };
}
async function cmdProjectsList(config) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const allProjects = [];
  let page = 1;
  let hasNextPage = true;
  while (hasNextPage) {
    const payload = await requestJson({
      method: "GET",
      pathName: `/api/projects?page=${page}&limit=100`,
      apiUrl,
      token
    });
    const data = extractData(payload);
    const normalized = normalizeProjects(data);
    allProjects.push(...normalized.projects);
    if (normalized.totalPages <= normalized.page) {
      hasNextPage = false;
    } else {
      hasNextPage = normalized.hasNextPage;
    }
    page += 1;
  }
  if (!allProjects.length) {
    info("No projects found.");
    return;
  }
  for (const p of allProjects) {
    console.log(`${p.slug ?? p.id}  ${p.name ?? ""}`);
  }
}

// src/lpad-dir.ts
import fs3 from "node:fs";
import path2 from "node:path";

// src/detect.ts
import fs2 from "node:fs";
import path from "node:path";
function fileExists(root, ...parts) {
  return fs2.existsSync(path.join(root, ...parts));
}
function readJsonFile(filePath) {
  try {
    return JSON.parse(fs2.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}
function readTextFile(filePath) {
  try {
    return fs2.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}
function packageJson(root) {
  return readJsonFile(path.join(root, "package.json"));
}
function hasDep(pkg, name) {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}
function scriptOr(pkg, script, fallback) {
  return pkg?.scripts?.[script]?.trim() || fallback;
}
function detectPython(root) {
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
    hasNextAuth: false
  };
}
function detectGo(root) {
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
    hasNextAuth: false
  };
}
function detectRust(root) {
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
    hasNextAuth: false
  };
}
function detectDocker(root) {
  const hasDockerfile = fileExists(root, "Dockerfile");
  const hasCompose = fileExists(root, "docker-compose.yml") || fileExists(root, "docker-compose.yaml") || fileExists(root, "compose.yml") || fileExists(root, "compose.yaml");
  if (!hasDockerfile && !hasCompose) return null;
  return {
    type: "docker",
    framework: hasDockerfile ? "Docker" : "Docker Compose",
    deployMode: "docker",
    buildCommand: hasDockerfile ? "docker build -t app ." : void 0,
    startCommand: hasCompose ? "docker compose up -d" : "docker run app",
    hasPrisma: false,
    hasNextAuth: false
  };
}
function detectNode(root, pkg) {
  if (hasDep(pkg, "next")) {
    const hasPrisma = hasDep(pkg, "@prisma/client") || hasDep(pkg, "prisma") || fileExists(root, "prisma", "schema.prisma");
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
      hasNextAuth
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
      hasNextAuth: false
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
      hasPrisma: hasDep(pkg, "@prisma/client") || hasDep(pkg, "prisma") || fileExists(root, "prisma", "schema.prisma"),
      hasNextAuth: false
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
      hasPrisma: hasDep(pkg, "@prisma/client") || hasDep(pkg, "prisma") || fileExists(root, "prisma", "schema.prisma"),
      hasNextAuth: hasDep(pkg, "next-auth")
    };
  }
  return null;
}
function detectStaticSite(root) {
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
    hasNextAuth: false
  };
}
function detectLpadConfig(root) {
  const config = readJsonFile(path.join(root, "lpad.config.json"));
  if (!config) return null;
  if (config.runtime === "binary" || config.deployMode === "script") {
    return {
      type: "binary",
      framework: config.type ?? "Custom script",
      deployMode: config.deployMode ?? "script",
      runtime: config.runtime ?? "binary",
      startCommand: config.deployScript,
      hasPrisma: false,
      hasNextAuth: false
    };
  }
  return null;
}
var FALLBACK = {
  type: "unknown",
  framework: "Unknown",
  deployMode: "pm2",
  hasPrisma: false,
  hasNextAuth: false
};
function detectProject(projectRoot) {
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
    () => detectStaticSite(root)
  ];
  for (const run of detectors) {
    const result = run();
    if (result) return result;
  }
  return FALLBACK;
}

// src/lpad-dir.ts
var LPAD_MANIFEST_VERSION = 1;
var LPAD_DIR_NAME = ".lpad";
var MANIFEST_FILE = "manifest.json";
var README_FILE = "README.md";
function lpadDirPath(projectRoot) {
  return path2.join(projectRoot, LPAD_DIR_NAME);
}
function manifestPath(projectRoot) {
  return path2.join(lpadDirPath(projectRoot), MANIFEST_FILE);
}
function findProjectRoot(startDir = process.cwd()) {
  let current = path2.resolve(startDir);
  const { root } = path2.parse(current);
  while (true) {
    const candidate = manifestPath(current);
    if (fs3.existsSync(candidate)) {
      return current;
    }
    const parent = path2.dirname(current);
    if (parent === current || current === root) {
      return null;
    }
    current = parent;
  }
}
function readManifest(projectRoot) {
  const filePath = manifestPath(projectRoot);
  try {
    if (!fs3.existsSync(filePath)) return null;
    return JSON.parse(fs3.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}
function readManifestFromCwd() {
  const root = findProjectRoot();
  return root ? readManifest(root) : null;
}
function inferSlugFromCwd(cwd = process.cwd()) {
  return path2.basename(cwd).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}
function defaultAssetsHints(projectSlug) {
  return [
    {
      key: "ASSETS_API_SECRET",
      description: "Assets API secret (sk_\u2026) \u2014 server-only Bearer token",
      secret: true,
      required: true
    },
    {
      key: "ASSETS_BASE_URL",
      description: "Assets API origin (e.g. https://assets.andgroupco.com)",
      required: true
    },
    {
      key: "ASSETS_PUBLIC_BASE_URL",
      description: "Public CDN origin for relative asset paths"
    },
    {
      key: "ASSETS_CLIENT_ID",
      description: `Assets client_id namespace (default: ${projectSlug})`
    }
  ];
}
function frameworkEnvHints(detected, productionDomain) {
  const hints = [];
  if (detected.hasPrisma) {
    hints.push({
      key: "DATABASE_URL",
      description: "Database connection string (PostgreSQL, MySQL, etc.)",
      secret: true,
      required: true
    });
  }
  if (detected.hasNextAuth) {
    const urlHint = productionDomain ? `https://${productionDomain.replace(/^https?:\/\//, "")}` : "your production URL";
    hints.push(
      {
        key: "NEXTAUTH_URL",
        description: `Public app URL (e.g. ${urlHint})`,
        required: true
      },
      {
        key: "NEXTAUTH_SECRET",
        description: "NextAuth session secret",
        secret: true,
        required: true
      }
    );
  }
  if (detected.type === "python") {
    hints.push({
      key: "PORT",
      description: "HTTP port for the Python process (Launchpad sets this at deploy)"
    });
  }
  if (detected.type === "go" || detected.type === "rust") {
    hints.push({
      key: "PORT",
      description: "HTTP port for the compiled binary"
    });
  }
  return hints;
}
function mergeEnvHints(existing, generated) {
  const byKey = /* @__PURE__ */ new Map();
  for (const hint of generated) {
    byKey.set(hint.key, hint);
  }
  for (const hint of existing ?? []) {
    byKey.set(hint.key, hint);
  }
  return [...byKey.values()];
}
function nginxRoutesForProject(detected) {
  switch (detected.type) {
    case "nextjs":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} app \u2014 reverse-proxied to the Node process`
          },
          {
            path: "/api/*",
            description: "Application API routes"
          }
        ]
      };
    case "node":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} server \u2014 reverse-proxied on the VPS`
          },
          {
            path: "/api/*",
            description: "Application API routes"
          }
        ]
      };
    case "python":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} API \u2014 reverse-proxied to the Python process`
          },
          {
            path: "/docs",
            description: "OpenAPI / Swagger docs (FastAPI)"
          }
        ]
      };
    case "static":
      return {
        routes: [
          {
            path: "/",
            description: "Static files served by nginx"
          }
        ]
      };
    case "docker":
      return {
        routes: [
          {
            path: "/",
            description: "Reverse-proxied to the Docker container"
          }
        ]
      };
    case "go":
    case "rust":
      return {
        routes: [
          {
            path: "/",
            description: `${detected.framework} binary \u2014 reverse-proxied on the VPS`
          }
        ]
      };
    case "binary":
      return {
        routes: [
          {
            path: "/",
            description: "Custom deploy script \u2014 nginx routing may be skipped (see lpad.config.json)"
          }
        ]
      };
    default:
      return {
        routes: [
          {
            path: "/",
            description: "Reverse-proxied to the application process on the VPS"
          }
        ]
      };
  }
}
function buildManifest(input) {
  const slug = input.slug.trim();
  const platformDomain = input.platformDomain ?? `${slug}.lpad.ekddigital.com`;
  const detected = input.detected ?? (input.projectRoot ? detectProject(input.projectRoot) : detectProject(process.cwd()));
  const frameworkHints = frameworkEnvHints(detected, input.productionDomain);
  const assetsHints = input.includeAssets !== false ? defaultAssetsHints(slug) : [];
  const hints = mergeEnvHints(void 0, [
    ...input.envHints ?? [],
    ...assetsHints,
    ...frameworkHints
  ]);
  const manifest = {
    version: LPAD_MANIFEST_VERSION,
    project: {
      slug,
      type: detected.type,
      ...input.name ? { name: input.name } : {}
    },
    lpad: {
      apiUrl: input.apiUrl,
      linkedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    deploy: {
      target: "vps",
      framework: detected.framework,
      deployMode: detected.deployMode,
      ...detected.runtime ? { runtime: detected.runtime } : {},
      ...detected.buildCommand !== void 0 ? { buildCommand: detected.buildCommand } : {},
      ...detected.startCommand ? { startCommand: detected.startCommand } : {},
      ...detected.outputDirectory ? { outputDirectory: detected.outputDirectory } : {},
      platformDomain,
      defaultBranch: input.defaultBranch ?? "main",
      ...input.productionDomain ? { productionDomain: input.productionDomain } : {}
    }
  };
  if (input.includeAssets !== false) {
    manifest.assets = {
      publicBaseUrl: "https://assets.andgroupco.com",
      apiBaseUrl: "https://assets.andgroupco.com/api/v1",
      clientId: slug,
      projectName: slug,
      cdnPathTemplate: "/assets/{clientId}/{projectName}/{assetType}/{filename}",
      ...input.assets
    };
  }
  if (hints.length > 0) {
    manifest.env = { hints };
  }
  manifest.nginx = nginxRoutesForProject(detected);
  return manifest;
}
function readmeContent(manifest) {
  const slug = manifest?.project?.slug ?? "{slug}";
  const projectType = manifest?.project?.type ?? "unknown";
  const framework = manifest?.deploy?.framework ?? "application";
  const platformDomain = manifest?.deploy?.platformDomain ?? `${slug}.lpad.ekddigital.com`;
  const productionDomain = manifest?.deploy?.productionDomain;
  const deployMode = manifest?.deploy?.deployMode ?? "pm2";
  const deploySection = deployMode === "static" ? `This **${framework}** project deploys as **static files** via nginx on the VPS.` : deployMode === "docker" ? `This **${framework}** project deploys via **Docker** on the VPS.` : deployMode === "script" || deployMode === "systemd" ? `This project uses **${deployMode}** deploy mode \u2014 see \`lpad.config.json\` for overrides.` : projectType === "python" || projectType === "go" || projectType === "rust" ? `This **${framework}** project deploys as a **long-running process** on the VPS (nginx reverse proxy).` : `This **${framework}** project deploys to **VPS via Launchpad** (nginx + PM2/Docker), not Vercel.`;
  const domainLines = [
    `- Platform URL: \`${platformDomain}\``,
    ...productionDomain ? [`- Production URL: \`${productionDomain}\``] : []
  ].join("\n");
  return `# .lpad \u2014 Launchpad project metadata

This directory is created automatically by \`lpad init\`, \`lpad link\`, \`lpad migrate\`, or the first \`lpad deploy\` when missing.
**Do not create or edit these files manually** \u2014 re-run the CLI to refresh metadata.
It is **safe to commit** \u2014 it contains no secrets.

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
- **Legacy CDN path:** \`/assets/{clientId}/{projectName}/\u2026/{uuid}.ext\` \u2014 nginx on the Assets VPS may serve files directly; the Assets app also redirects these to the download API.

Set secrets via \`lpad env set\` \u2014 never commit \`sk_\u2026\` keys.

## Commands

\`\`\`bash
lpad migrate              # refresh .lpad/ from Launchpad API + local detection
lpad deploy --prod
lpad env pull --environment production
lpad domains ${slug}
\`\`\`
`;
}
function writeLpadDir(projectRoot, manifest, options) {
  const dir = lpadDirPath(projectRoot);
  const manifestFile = manifestPath(projectRoot);
  const readmeFile = path2.join(dir, README_FILE);
  const manifestExists = fs3.existsSync(manifestFile);
  if (manifestExists && !options?.force) {
    const existing = readManifest(projectRoot);
    const merged = {
      ...existing,
      ...manifest,
      project: { ...existing?.project, ...manifest.project },
      lpad: {
        ...existing?.lpad,
        ...manifest.lpad,
        linkedAt: manifest.lpad.linkedAt
      },
      deploy: {
        target: "vps",
        ...existing?.deploy,
        ...manifest.deploy
      },
      assets: { ...existing?.assets, ...manifest.assets },
      env: {
        hints: mergeEnvHints(existing?.env?.hints, manifest.env?.hints ?? [])
      },
      nginx: manifest.nginx ?? existing?.nginx
    };
    fs3.mkdirSync(dir, { recursive: true });
    fs3.writeFileSync(
      manifestFile,
      JSON.stringify(merged, null, 2) + "\n",
      "utf8"
    );
    fs3.writeFileSync(readmeFile, readmeContent(merged), "utf8");
    return { created: false, updated: true };
  }
  fs3.mkdirSync(dir, { recursive: true });
  fs3.writeFileSync(
    manifestFile,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  fs3.writeFileSync(readmeFile, readmeContent(manifest), "utf8");
  return { created: !manifestExists, updated: manifestExists };
}
function defaultApiUrlForManifest(apiUrl) {
  return apiUrl ?? process.env.LPAD_API_URL ?? DEFAULT_API_URL;
}

// src/scaffold.ts
import fs4 from "node:fs";
async function fetchProjectMetadata(apiUrl, token, slug) {
  let projectName;
  let defaultBranch = "main";
  let platformDomain = `${slug}.lpad.ekddigital.com`;
  let productionDomain;
  let foundOnServer = false;
  try {
    const settingsPayload = await requestJson({
      method: "GET",
      pathName: `/api/projects/${encodeURIComponent(slug)}/settings`,
      apiUrl,
      token
    });
    const settings = extractData(settingsPayload);
    const projectBlock = settings.project ?? settings.settings;
    projectName = projectBlock?.name ?? settings.name;
    defaultBranch = projectBlock?.repository?.branch ?? projectBlock?.repository?.default_branch ?? defaultBranch;
    foundOnServer = true;
  } catch {
  }
  try {
    const domainsPayload = await requestJson({
      method: "GET",
      pathName: `/api/projects/${encodeURIComponent(slug)}/domains`,
      apiUrl,
      token
    });
    const domainsData = extractData(domainsPayload);
    const activeDomains = (domainsData.domains ?? []).filter(
      (d) => d.isActive !== false && d.isVerified !== false
    );
    const custom = activeDomains.find(
      (d) => d.domain && !d.domain.endsWith(".lpad.ekddigital.com")
    );
    if (custom?.domain) {
      productionDomain = custom.domain;
    }
    const platform = activeDomains.find(
      (d) => d.domain?.endsWith(".lpad.ekddigital.com")
    );
    if (platform?.domain) {
      platformDomain = platform.domain;
    }
  } catch {
  }
  return {
    projectName,
    defaultBranch,
    platformDomain,
    productionDomain,
    foundOnServer
  };
}
async function scaffoldLpadDir(options) {
  const cwd = options.cwd ?? process.cwd();
  const slug = options.slug.trim();
  const includeAssets = options.includeAssets !== false;
  const fetchFromServer = options.fetchFromServer ?? Boolean(options.token?.trim());
  let projectName;
  let defaultBranch = "main";
  let platformDomain = `${slug}.lpad.ekddigital.com`;
  let productionDomain;
  if (fetchFromServer && options.token) {
    const meta = await fetchProjectMetadata(
      options.apiUrl,
      options.token,
      slug
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
    projectRoot: cwd
  });
  const { created, updated } = writeLpadDir(cwd, manifest, {
    force: options.force
  });
  if (options.updateConfig !== false) {
    writeConfig({
      ...options.config,
      linkedProject: slug,
      apiUrl: options.apiUrl
    });
  }
  return {
    created,
    updated,
    manifestFile: manifestPath(cwd),
    slug,
    platformDomain,
    productionDomain
  };
}
function lpadDirExists(cwd = process.cwd()) {
  return fs4.existsSync(manifestPath(cwd));
}

// src/commands/init.ts
async function cmdInit(config, projectArg, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const slug = projectArg ?? (typeof flags.slug === "string" ? flags.slug : void 0) ?? inferSlugFromCwd();
  if (!slug) {
    fail(
      "Usage: lpad init <projectSlug>  (or run from a named project directory)"
    );
  }
  const result = await scaffoldLpadDir({
    config,
    slug,
    apiUrl,
    token,
    force: Boolean(flags.force),
    includeAssets: !flags["no-assets"],
    fetchFromServer: true
  });
  if (result.created) {
    ok(`Initialized ${result.manifestFile}`);
  } else if (result.updated) {
    ok(`Updated ${result.manifestFile}`);
  } else {
    ok(`Linked project: ${slug}`);
  }
  info(`Platform domain: ${result.platformDomain}`);
  if (result.productionDomain) info(`Production domain: ${result.productionDomain}`);
  info("Secrets stay in Launchpad \u2014 use `lpad env set` for production values.");
}

// src/commands/migrate.ts
async function cmdMigrate(config, projectArg, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const slug = projectArg ?? (typeof flags.slug === "string" ? flags.slug : void 0) ?? config.linkedProject ?? inferSlugFromCwd();
  if (!slug) {
    fail(
      "Usage: lpad migrate [projectSlug]  (or run from a linked project directory)"
    );
  }
  const result = await scaffoldLpadDir({
    config,
    slug,
    apiUrl,
    token,
    force: Boolean(flags.force),
    includeAssets: !flags["no-assets"],
    fetchFromServer: true
  });
  if (result.created) {
    ok(`Created ${result.manifestFile}`);
  } else if (result.updated) {
    ok(`Updated ${result.manifestFile}`);
  } else {
    ok(`Project metadata already present: ${result.manifestFile}`);
  }
  info(`Platform domain: ${result.platformDomain}`);
  if (result.productionDomain) {
    info(`Production domain: ${result.productionDomain}`);
  }
  info(
    "Commit `.lpad/` to git \u2014 it contains no secrets. Use `lpad env set` for production values."
  );
}

// src/commands/link.ts
async function cmdLink(config, projectSlug) {
  if (!projectSlug) fail("Usage: lpad link <projectSlug>");
  const apiUrl = defaultApiUrlForManifest(getApiUrl(config));
  const token = getToken(config);
  const result = await scaffoldLpadDir({
    config,
    slug: projectSlug,
    apiUrl,
    token: token || void 0,
    fetchFromServer: Boolean(token),
    includeAssets: true
  });
  ok(`Linked default project: ${projectSlug}`);
  if (result.created) {
    ok(`Created ${result.manifestFile}`);
  } else if (result.updated) {
    ok(`Updated ${result.manifestFile}`);
  }
}
function cmdUnlink(config) {
  const { linkedProject: _lp, ...rest } = config;
  writeConfig(rest);
  ok("Unlinked default project.");
}

// src/project.ts
function resolveProject(config, arg) {
  if (arg) return arg;
  const manifest = readManifestFromCwd();
  if (manifest?.project?.slug) {
    return manifest.project.slug;
  }
  const slug = config.linkedProject;
  if (!slug) {
    fail(
      "No project specified. Run `lpad init`, `lpad link`, or `lpad migrate`, or pass the slug explicitly."
    );
  }
  return slug;
}

// src/commands/deploy.ts
async function cmdDeploy(config, projectArg, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const projectSlug = resolveProject(config, projectArg);
  if (!lpadDirExists()) {
    const bootstrapped = await scaffoldLpadDir({
      config,
      slug: projectSlug,
      apiUrl,
      token,
      fetchFromServer: true,
      updateConfig: true
    });
    if (bootstrapped.created) {
      info(`Created ${bootstrapped.manifestFile} (auto-bootstrap on deploy)`);
    } else if (bootstrapped.updated) {
      info(`Updated ${bootstrapped.manifestFile} (auto-bootstrap on deploy)`);
    }
  }
  const body = {
    branch: String(flags.branch ?? "main"),
    region: String(flags.region ?? "us-east-1"),
    ssl: !flags["no-ssl"],
    cdn: Boolean(flags.cdn),
    analytics: !flags["no-analytics"]
  };
  if (flags.prod) body.isProduction = true;
  if (flags["custom-domain"])
    body.customDomain = String(flags["custom-domain"]);
  if (flags.env) {
    warn(
      "--env values (including secrets) are visible in shell history. Use `lpad env set` for persistent secrets instead."
    );
    const envEntries = Array.isArray(flags.env) ? flags.env : [flags.env];
    const environmentVariables = {};
    for (const entry of envEntries) {
      const eqIdx = entry.indexOf("=");
      if (eqIdx === -1) fail(`Invalid --env value "${entry}". Expected KEY=VALUE.`);
      environmentVariables[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
    }
    body.environmentVariables = environmentVariables;
  }
  const payload = await requestJson({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deploy`,
    apiUrl,
    token,
    body
  });
  const data = extractData(payload);
  const deployment = data.deployment ?? data;
  ok(
    `Deployment started: ${deployment.deploymentId ?? deployment.id ?? "unknown"}`
  );
  if (deployment.url) info(`URL: ${deployment.url}`);
}

// src/commands/env.ts
import fs5 from "node:fs";
import path3 from "node:path";
async function cmdEnvPull(config, projectArg, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const projectSlug = resolveProject(config, projectArg);
  const envName = String(flags.environment ?? "production").toLowerCase();
  const output = String(flags.output ?? `.env.${envName}`);
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
    apiUrl,
    token
  });
  const data = extractData(payload);
  const vars = Array.isArray(data.variables) ? data.variables : [];
  const lines = vars.filter((v) => {
    const env = String(v.environment ?? "").toLowerCase();
    return env === envName || env === "all";
  }).map((v) => `${v.key}=${String(v.value).replace(/\n/g, "\\n")}`);
  fs5.writeFileSync(
    path3.resolve(output),
    lines.join("\n") + (lines.length ? "\n" : ""),
    "utf8"
  );
  ok(`Wrote ${lines.length} variable(s) to ${output}`);
}
async function cmdEnvSet(config, args, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const [projectMaybe, keyMaybe, valueMaybe] = args;
  let projectSlug = config.linkedProject;
  let key = keyMaybe;
  let value = valueMaybe;
  if (args.length >= 3) {
    projectSlug = projectMaybe;
  } else if (args.length === 2) {
    key = projectMaybe;
    value = keyMaybe;
  }
  if (!projectSlug) {
    fail(
      "No project specified. Use `lpad link <projectSlug>` or pass it explicitly."
    );
  }
  if (!key || value === void 0) {
    fail(
      "Usage: lpad env set [projectSlug] <KEY> <VALUE> [--environment production] [--secret]"
    );
  }
  const body = {
    key: String(key),
    value: String(value),
    environment: String(flags.environment ?? "production"),
    isSecret: Boolean(flags.secret),
    description: flags.description ? String(flags.description) : void 0
  };
  await requestJson({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
    apiUrl,
    token,
    body
  });
  ok(`Saved ${key} for ${projectSlug} (${body.environment})`);
}
async function cmdEnvList(config, projectArg, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const projectSlug = resolveProject(config, projectArg);
  const envFilter = flags.environment ? String(flags.environment).toLowerCase() : null;
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
    apiUrl,
    token
  });
  const data = extractData(payload);
  const vars = (data?.variables ?? []).filter((v) => {
    if (!envFilter) return true;
    const env = String(v.environment ?? "").toLowerCase();
    return env === envFilter || env === "all";
  });
  if (!vars.length) {
    info("No environment variables found.");
    return;
  }
  const label = envFilter ? ` (${envFilter})` : "";
  console.log();
  console.log(`  Environment variables for ${projectSlug}${label}:`);
  console.log();
  for (const v of vars) {
    const secret = v.isSecret ? "  [secret]" : "";
    const env = v.environment ? `  (${v.environment})` : "";
    const displayValue = v.isSecret ? "\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF" : v.value;
    console.log(`  ${v.key}=${displayValue}${secret}${env}`);
  }
  console.log();
}

// src/commands/config-cmd.ts
function validateApiUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Invalid URL: "${raw}". Example: https://lpad.ekddigital.com`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    fail(`URL must use http or https: "${raw}"`);
  }
  return parsed.href.replace(/\/$/, "");
}
function cmdConfig(config, args) {
  const [sub, key, value] = args;
  if (sub === "get") {
    if (key === "api") {
      console.log(getApiUrl(config));
      return;
    }
    fail("Usage: lpad config get api");
  }
  if (sub === "set") {
    if (key === "api" && value) {
      const cleanUrl = validateApiUrl(value);
      writeConfig({ ...config, apiUrl: cleanUrl });
      ok(`apiUrl set to ${cleanUrl}`);
      return;
    }
    fail("Usage: lpad config set api <url>");
  }
  fail("Usage: lpad config <get|set> api [value]");
}

// src/commands/update.ts
function cmdUpdate() {
  const repo = process.env.LPAD_CLI_REPO ?? "ekddigital/lpad-cli";
  const installer = `https://raw.githubusercontent.com/${repo}/main/install.sh`;
  info(`Update via: curl -fsSL ${installer} | bash`);
  info("Run the command above to update lpad globally.");
}

// src/commands/logs.ts
function levelColor(level, msg) {
  if (!isColorEnabled(process.stdout.isTTY)) return msg;
  const codes = {
    error: "\x1B[31m",
    warn: "\x1B[33m",
    info: "\x1B[34m",
    debug: "\x1B[90m"
  };
  const reset = "\x1B[0m";
  return `${codes[level.toLowerCase()] ?? ""}${msg}${reset}`;
}
function printLog(log) {
  const ts = new Date(log.timestamp).toLocaleTimeString();
  const lvl = log.level.toUpperCase().padEnd(5);
  console.log(levelColor(log.level, `${ts}  ${lvl}  ${sanitize(log.message)}`));
}
async function resolveDeploymentId(projectSlug, deploymentArg, apiUrl, token) {
  if (deploymentArg) return deploymentArg;
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deployments?limit=1`,
    apiUrl,
    token
  });
  const data = extractData(payload);
  const latest = (data?.deployments ?? [])[0];
  if (!latest?.id) {
    fail(`No deployments found for project "${projectSlug}".`);
  }
  return latest.id;
}
async function streamLogs(logsUrl, token) {
  assertSecureTransport(logsUrl, true);
  const STREAM_TIMEOUT_MS = 22 * 60 * 1e3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(logsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
        "User-Agent": `lpad-cli/${VERSION}`
      },
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Log stream timed out after 22 minutes.");
    }
    throw err;
  }
  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text();
    let msg;
    try {
      msg = JSON.parse(text).error ?? text;
    } catch {
      msg = text;
    }
    fail(`Logs stream error: ${sanitize(msg)}`);
  }
  if (!res.body) {
    clearTimeout(timer);
    fail("No response body from logs stream.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (!block.trim()) continue;
        const lines = block.split("\n");
        let event = "message";
        let dataStr = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
        }
        if (event === "done") {
          return;
        }
        if (event === "log") {
          try {
            printLog(JSON.parse(dataStr));
          } catch {
          }
        }
        if (event === "status") {
          try {
            const s = JSON.parse(dataStr);
            const bt = s.buildTime ? ` (${(s.buildTime / 1e3).toFixed(1)}s)` : "";
            info(`Status: ${sanitize(s.status ?? "unknown")}${bt}`);
          } catch {
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
async function cmdLogs(config, args, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const projectArg = args[0] ?? config.linkedProject;
  if (!projectArg) {
    fail("Usage: lpad logs <projectSlug> [deploymentId] [--follow]");
  }
  const projectSlug = resolveProject(config, projectArg);
  const deploymentArg = args[1];
  const deploymentId = await resolveDeploymentId(
    projectSlug,
    deploymentArg,
    apiUrl,
    token
  );
  const logsBase = `/api/projects/${encodeURIComponent(projectSlug)}/deployments/${encodeURIComponent(deploymentId)}/logs`;
  const follow = flags.follow || flags.f;
  if (follow) {
    info(
      `Streaming logs for deployment ${deploymentId} \u2014 press Ctrl+C to stop`
    );
    console.log();
    await streamLogs(`${apiUrl}${logsBase}`, token);
    ok("Stream ended.");
  } else {
    const payload = await requestJson({
      method: "GET",
      pathName: `${logsBase}?format=json`,
      apiUrl,
      token
    });
    const { logs, deployment } = payload;
    if (!logs || logs.length === 0) {
      info("No logs available for this deployment.");
      return;
    }
    console.log();
    for (const log of logs) printLog(log);
    console.log();
    const bt = deployment.buildTime ? ` \u2014 ${(deployment.buildTime / 1e3).toFixed(1)}s` : "";
    ok(`Deployment ${deployment.id}  status: ${deployment.status}${bt}`);
  }
}

// src/commands/deployments.ts
function statusIcon(status) {
  if (!isColorEnabled(process.stdout.isTTY)) return `[${status}]`;
  const map = {
    SUCCESS: "\x1B[32m\u2713\x1B[0m",
    READY: "\x1B[32m\u2713\x1B[0m",
    FAILED: "\x1B[31m\u2717\x1B[0m",
    ERROR: "\x1B[31m\u2717\x1B[0m",
    BUILDING: "\x1B[33m\u27F3\x1B[0m",
    PENDING: "\x1B[33m\u2026\x1B[0m",
    CANCELLED: "\x1B[90m\u2013\x1B[0m"
  };
  return `${map[status.toUpperCase()] ?? ""} ${status}`;
}
async function cmdDeploymentsList(config, projectArg, flags) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const projectSlug = resolveProject(config, projectArg);
  const limit = flags.limit ? String(flags.limit) : "10";
  const production = flags.production ? "&production=true" : "";
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deployments?limit=${encodeURIComponent(limit)}${production}`,
    apiUrl,
    token
  });
  const data = extractData(payload);
  const deployments = data?.deployments ?? [];
  if (!deployments.length) {
    info("No deployments found.");
    return;
  }
  console.log();
  for (const d of deployments) {
    const bt = d.buildTime ? `  ${(d.buildTime / 1e3).toFixed(1)}s` : "";
    const prod = d.isProduction ? "  [prod]" : "";
    const branch = d.branch ? `  ${sanitize(d.branch)}` : "";
    const url = sanitize(d.deployUrl ?? d.url ?? "");
    const sha = d.commitSha ? `  ${sanitize(d.commitSha).slice(0, 7)}` : "";
    const msg = d.commitMessage ? `  ${sanitize(d.commitMessage).slice(0, 60)}` : "";
    console.log(`  ${statusIcon(d.status)}${prod}${branch}${sha}${bt}${msg}`);
    if (url) console.log(`    ${url}`);
    console.log(`    id: ${sanitize(d.id)}`);
    console.log();
  }
}
async function cmdDeploymentsInspect(config, deploymentId, projectArg) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  if (!deploymentId)
    fail("Usage: lpad deployments inspect <deploymentId> [projectSlug]");
  const projectSlug = resolveProject(config, projectArg);
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deployments/${encodeURIComponent(deploymentId)}`,
    apiUrl,
    token
  });
  const data = extractData(payload);
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
    console.log(`  build time:  ${(data.buildTime / 1e3).toFixed(1)}s`);
  if (data.commitSha)
    console.log(
      `  commit:      ${sanitize(data.commitSha).slice(0, 7)}  ${sanitize(data.commitMessage ?? "")}`
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

// src/commands/domains.ts
async function cmdDomainsList(config, projectArg) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const projectSlug = resolveProject(config, projectArg);
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/domains`,
    apiUrl,
    token
  });
  const data = extractData(payload);
  const domains = data?.domains ?? [];
  if (!domains.length) {
    info("No domains configured for this project.");
    return;
  }
  console.log();
  console.log(`  Domains for ${projectSlug}:`);
  console.log();
  for (const d of domains) {
    const ssl = d.sslEnabled ? "  SSL \u2713" : "  SSL \u2717";
    const primary = d.isPrimary ? "  [primary]" : "";
    const active = d.isActive === false ? "  [inactive]" : "";
    const expiry = d.sslCertExpiry ? `  (cert expires ${new Date(d.sslCertExpiry).toLocaleDateString()})` : "";
    console.log(`  ${d.hostname}${primary}${active}${ssl}${expiry}`);
  }
  console.log();
}

// src/commands/org.ts
function requireAuth(config) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token };
}
async function cmdOrgList(config) {
  const { apiUrl, token } = requireAuth(config);
  const payload = await requestJson({
    method: "GET",
    pathName: "/api/organizations",
    apiUrl,
    token
  });
  const orgs = extractData(payload) ?? [];
  if (!orgs.length) {
    info("No organizations found.");
    return;
  }
  for (const org of orgs) {
    const role = org.role ? ` (${org.role})` : "";
    console.log(
      `${org.slug}  ${org.name}${role}  members=${org.stats.members} teams=${org.stats.teams} projects=${org.stats.projects}`
    );
  }
}
async function cmdOrgCreate(config, name, flags) {
  const { apiUrl, token } = requireAuth(config);
  if (!name) fail("Usage: lpad org create <name> [--slug <slug>] [--description <text>]");
  const payload = await requestJson({
    method: "POST",
    pathName: "/api/organizations",
    apiUrl,
    token,
    body: {
      name,
      slug: flags.slug ? String(flags.slug) : void 0,
      description: flags.description ? String(flags.description) : void 0
    }
  });
  const org = extractData(payload);
  ok(`Created organization ${org.slug} (${org.name})`);
}
async function cmdOrgShow(config, slug) {
  const { apiUrl, token } = requireAuth(config);
  if (!slug) fail("Usage: lpad org show <orgSlug>");
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(slug)}`,
    apiUrl,
    token
  });
  const org = extractData(payload);
  console.log(`${org.name}  (@${org.slug})`);
  if (org.description) console.log(org.description);
  console.log(
    `role=${org.role}  members=${org.stats.members}  teams=${org.stats.teams}  projects=${org.stats.projects}`
  );
}
async function cmdOrgMembersList(config, slug) {
  const { apiUrl, token } = requireAuth(config);
  if (!slug) fail("Usage: lpad org members list <orgSlug>");
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(slug)}/members`,
    apiUrl,
    token
  });
  const members = extractData(payload) ?? [];
  if (!members.length) {
    info("No members found.");
    return;
  }
  for (const m of members) {
    console.log(`${m.email}  ${m.role}  ${m.name ?? ""}`.trimEnd());
  }
}
async function cmdOrgMembersAdd(config, slug, email, flags) {
  const { apiUrl, token } = requireAuth(config);
  if (!slug || !email)
    fail("Usage: lpad org members add <orgSlug> <email> [--role VIEWER]");
  const payload = await requestJson({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(slug)}/members`,
    apiUrl,
    token,
    body: { email, role: String(flags.role ?? "VIEWER").toUpperCase() }
  });
  const member = extractData(payload);
  ok(`Added ${member.email} as ${member.role} to ${slug}`);
}
async function cmdOrgMembersRole(config, slug, userId, role) {
  const { apiUrl, token } = requireAuth(config);
  if (!slug || !userId || !role)
    fail("Usage: lpad org members role <orgSlug> <userId> <role>");
  await requestJson({
    method: "PATCH",
    pathName: `/api/organizations/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
    apiUrl,
    token,
    body: { role: String(role).toUpperCase() }
  });
  ok(`Updated role for ${userId} to ${String(role).toUpperCase()}`);
}
async function cmdOrgMembersRemove(config, slug, userId) {
  const { apiUrl, token } = requireAuth(config);
  if (!slug || !userId) fail("Usage: lpad org members remove <orgSlug> <userId>");
  await requestJson({
    method: "DELETE",
    pathName: `/api/organizations/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
    apiUrl,
    token
  });
  ok(`Removed ${userId} from ${slug}`);
}

// src/commands/team.ts
function requireAuth2(config) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token };
}
async function cmdTeamList(config, orgSlug) {
  const { apiUrl, token } = requireAuth2(config);
  if (!orgSlug) fail("Usage: lpad team list <orgSlug>");
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/teams`,
    apiUrl,
    token
  });
  const teams = extractData(payload) ?? [];
  if (!teams.length) {
    info("No teams found.");
    return;
  }
  for (const t of teams) {
    console.log(`${t.slug}  ${t.name}  members=${t.memberCount}`);
  }
}
async function cmdTeamCreate(config, orgSlug, name, flags) {
  const { apiUrl, token } = requireAuth2(config);
  if (!orgSlug || !name)
    fail("Usage: lpad team create <orgSlug> <name> [--slug <slug>] [--description <text>]");
  const payload = await requestJson({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/teams`,
    apiUrl,
    token,
    body: {
      name,
      slug: flags.slug ? String(flags.slug) : void 0,
      description: flags.description ? String(flags.description) : void 0
    }
  });
  const team = extractData(payload);
  ok(`Created team ${team.slug} (${team.name}) in ${orgSlug}`);
}
async function cmdTeamDelete(config, orgSlug, teamSlug) {
  const { apiUrl, token } = requireAuth2(config);
  if (!orgSlug || !teamSlug) fail("Usage: lpad team delete <orgSlug> <teamSlug>");
  await requestJson({
    method: "DELETE",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/teams/${encodeURIComponent(teamSlug)}`,
    apiUrl,
    token
  });
  ok(`Deleted team ${teamSlug} from ${orgSlug}`);
}
async function cmdTeamMembersAdd(config, orgSlug, teamSlug, userId, flags) {
  const { apiUrl, token } = requireAuth2(config);
  if (!orgSlug || !teamSlug || !userId)
    fail("Usage: lpad team members add <orgSlug> <teamSlug> <userId> [--role MEMBER]");
  await requestJson({
    method: "POST",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/teams/${encodeURIComponent(teamSlug)}/members`,
    apiUrl,
    token,
    body: { userId, role: String(flags.role ?? "MEMBER").toUpperCase() }
  });
  ok(`Added ${userId} to team ${teamSlug}`);
}
async function cmdTeamMembersRemove(config, orgSlug, teamSlug, userId) {
  const { apiUrl, token } = requireAuth2(config);
  if (!orgSlug || !teamSlug || !userId)
    fail("Usage: lpad team members remove <orgSlug> <teamSlug> <userId>");
  await requestJson({
    method: "DELETE",
    pathName: `/api/organizations/${encodeURIComponent(orgSlug)}/teams/${encodeURIComponent(teamSlug)}/members/${encodeURIComponent(userId)}`,
    apiUrl,
    token
  });
  ok(`Removed ${userId} from team ${teamSlug}`);
}

// src/commands/collaboration.ts
function requireAuth3(config) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  return { apiUrl, token };
}
async function cmdIssuesList(config, projectArg, flags) {
  const { apiUrl, token } = requireAuth3(config);
  const projectSlug = resolveProject(config, projectArg);
  const state = flags.state ? `?state=${encodeURIComponent(String(flags.state))}` : "";
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/issues${state}`,
    apiUrl,
    token
  });
  const data = extractData(payload);
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
async function cmdIssuesSync(config, projectArg) {
  const { apiUrl, token } = requireAuth3(config);
  const projectSlug = resolveProject(config, projectArg);
  const payload = await requestJson({
    method: "POST",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/collaboration-sync`,
    apiUrl,
    token
  });
  const data = extractData(payload);
  info(`Synced ${data.issuesSynced} issues, ${data.pullRequestsSynced} pull requests.`);
}
async function cmdPullRequestsList(config, projectArg, flags) {
  const { apiUrl, token } = requireAuth3(config);
  const projectSlug = resolveProject(config, projectArg);
  const state = flags.state ? `?state=${encodeURIComponent(String(flags.state))}` : "";
  const payload = await requestJson({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/pull-requests${state}`,
    apiUrl,
    token
  });
  const data = extractData(payload);
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
      `#${pr.number}  [${status}]  ${pr.title}  (${pr.headBranch} -> ${pr.baseBranch})`
    );
  }
}

// src/index.ts
function helpText() {
  return [
    `lpad v${VERSION} \u2014 EKD Digital Launchpad CLI`,
    "",
    "Usage:",
    "  lpad <command> [args] [flags]",
    "",
    "Auth:",
    "  lpad login --email <email> --password <password>",
    "  lpad login --github",
    "  lpad login --token <jwt>",
    "  lpad whoami",
    "  lpad logout",
    "",
    "Projects:",
    "  lpad init <projectSlug> [--force] [--no-assets]",
    "  lpad migrate [projectSlug] [--force] [--no-assets]  Existing projects",
    "  lpad projects list",
    "  lpad link <projectSlug>                       Also creates .lpad/",
    "  lpad unlink",
    "",
    "  .lpad/ is created automatically by init, link, migrate, and deploy.",
    "  No manual mkdir \u2014 commit manifest.json (no secrets).",
    "",
    "Deploy:",
    "  lpad deploy [projectSlug] [--prod] [--branch main] [--region us-east-1]",
    "  lpad deploy [projectSlug] [--env KEY=VAL ...]  Inline env overrides",
    "  lpad push  [projectSlug]                       Alias of deploy",
    "",
    "Deployments:",
    "  lpad deployments list    [projectSlug] [--limit 10] [--production]",
    "  lpad deployments inspect <deploymentId> [projectSlug]",
    "",
    "Logs:",
    "  lpad logs [projectSlug] [deploymentId] [--follow | -f]",
    "",
    "Domains:",
    "  lpad domains [projectSlug]",
    "",
    "Organizations:",
    "  lpad org list",
    "  lpad org create <name> [--slug <slug>] [--description <text>]",
    "  lpad org show <orgSlug>",
    "  lpad org members list <orgSlug>",
    "  lpad org members add <orgSlug> <email> [--role VIEWER]",
    "  lpad org members role <orgSlug> <userId> <role>",
    "  lpad org members remove <orgSlug> <userId>",
    "",
    "Teams:",
    "  lpad team list <orgSlug>",
    "  lpad team create <orgSlug> <name> [--slug <slug>] [--description <text>]",
    "  lpad team delete <orgSlug> <teamSlug>",
    "  lpad team members add <orgSlug> <teamSlug> <userId> [--role MEMBER]",
    "  lpad team members remove <orgSlug> <teamSlug> <userId>",
    "",
    "Issues & Pull Requests (synced from GitHub):",
    "  lpad issues list [projectSlug] [--state open|closed|all]",
    "  lpad issues sync [projectSlug]",
    "  lpad pr list [projectSlug] [--state open|closed|all]",
    "  lpad pr sync [projectSlug]",
    "",
    "Environment:",
    "  lpad env list [projectSlug] [--environment production]",
    "  lpad env pull [projectSlug] [--environment production] [--output .env.production]",
    "  lpad env set  [projectSlug] <KEY> <VALUE> [--environment production] [--secret]",
    "  lpad pull [projectSlug]          Alias of env pull",
    "",
    "Config:",
    "  lpad config get api",
    "  lpad config set api <url>",
    "",
    "Other:",
    "  lpad update",
    "  lpad version | -v | --version",
    "  lpad help",
    ""
  ].join("\n");
}
async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  if (flags.version || positional[0] === "version") {
    console.log(`lpad v${VERSION}`);
    return;
  }
  if (flags.help || positional.length === 0 || positional[0] === "help") {
    process.stdout.write(helpText());
    return;
  }
  const [command, ...args] = positional;
  const config = readConfig();
  try {
    switch (command) {
      case "login":
        return void await cmdLogin(config, flags);
      case "whoami":
        return void await cmdWhoami(config);
      case "logout":
        return void cmdLogout(config);
      case "projects":
        if (args[0] === "list") return void await cmdProjectsList(config);
        break;
      case "init":
        return void await cmdInit(config, args[0], flags);
      case "migrate":
        return void await cmdMigrate(config, args[0], flags);
      case "link":
        return void await cmdLink(config, args[0]);
      case "unlink":
        return void cmdUnlink(config);
      case "deploy":
      case "push":
        return void await cmdDeploy(config, args[0], flags);
      case "env":
        if (args[0] === "pull")
          return void await cmdEnvPull(config, args[1], flags);
        if (args[0] === "set")
          return void await cmdEnvSet(config, args.slice(1), flags);
        if (args[0] === "list")
          return void await cmdEnvList(config, args[1], flags);
        break;
      case "pull":
        return void await cmdEnvPull(config, args[0], flags);
      case "logs":
        return void await cmdLogs(config, args, flags);
      case "deployments":
        if (args[0] === "inspect")
          return void await cmdDeploymentsInspect(config, args[1], args[2]);
        return void await cmdDeploymentsList(
          config,
          args[0] === "list" ? args[1] : args[0],
          flags
        );
      case "domains":
        return void await cmdDomainsList(config, args[0]);
      case "org":
        if (args[0] === "list") return void await cmdOrgList(config);
        if (args[0] === "create")
          return void await cmdOrgCreate(config, args[1], flags);
        if (args[0] === "show") return void await cmdOrgShow(config, args[1]);
        if (args[0] === "members") {
          if (args[1] === "list")
            return void await cmdOrgMembersList(config, args[2]);
          if (args[1] === "add")
            return void await cmdOrgMembersAdd(
              config,
              args[2],
              args[3],
              flags
            );
          if (args[1] === "role")
            return void await cmdOrgMembersRole(
              config,
              args[2],
              args[3],
              args[4]
            );
          if (args[1] === "remove")
            return void await cmdOrgMembersRemove(config, args[2], args[3]);
        }
        break;
      case "team":
        if (args[0] === "list")
          return void await cmdTeamList(config, args[1]);
        if (args[0] === "create")
          return void await cmdTeamCreate(config, args[1], args[2], flags);
        if (args[0] === "delete")
          return void await cmdTeamDelete(config, args[1], args[2]);
        if (args[0] === "members") {
          if (args[1] === "add")
            return void await cmdTeamMembersAdd(
              config,
              args[2],
              args[3],
              args[4],
              flags
            );
          if (args[1] === "remove")
            return void await cmdTeamMembersRemove(
              config,
              args[2],
              args[3],
              args[4]
            );
        }
        break;
      case "issues":
        if (args[0] === "sync") return void await cmdIssuesSync(config, args[1]);
        return void await cmdIssuesList(config, args[0] === "list" ? args[1] : args[0], flags);
      case "pr":
        if (args[0] === "sync") return void await cmdIssuesSync(config, args[1]);
        return void await cmdPullRequestsList(
          config,
          args[0] === "list" ? args[1] : args[0],
          flags
        );
      case "config":
        return void cmdConfig(config, args);
      case "update":
        return void cmdUpdate();
    }
    fail(`Unknown command: ${command}. Run \`lpad help\` for usage.`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
main();
