#!/usr/bin/env node

// src/constants.ts
var VERSION = "0.1.1";
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
async function cmdProjectsList(config) {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");
  const payload = await requestJson({
    method: "GET",
    pathName: "/api/projects",
    apiUrl,
    token
  });
  const data = extractData(payload);
  const projects = Array.isArray(data) ? data : data.projects ?? [];
  if (!projects.length) {
    info("No projects found.");
    return;
  }
  for (const p of projects) {
    console.log(`${p.slug ?? p.id}  ${p.name ?? ""}`);
  }
}

// src/commands/link.ts
function cmdLink(config, projectSlug) {
  if (!projectSlug) fail("Usage: lpad link <projectSlug>");
  writeConfig({ ...config, linkedProject: projectSlug });
  ok(`Linked default project: ${projectSlug}`);
}
function cmdUnlink(config) {
  const { linkedProject: _lp, ...rest } = config;
  writeConfig(rest);
  ok("Unlinked default project.");
}

// src/project.ts
function resolveProject(config, arg) {
  const slug = arg ?? config.linkedProject;
  if (!slug) {
    fail(
      "No project specified. Use `lpad link <projectSlug>` or pass the slug explicitly."
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
import fs2 from "node:fs";
import path from "node:path";
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
  fs2.writeFileSync(
    path.resolve(output),
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
    "  lpad login --token <jwt>",
    "  lpad whoami",
    "  lpad logout",
    "",
    "Projects:",
    "  lpad projects list",
    "  lpad link <projectSlug>",
    "  lpad unlink",
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
      case "link":
        return void cmdLink(config, args[0]);
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
