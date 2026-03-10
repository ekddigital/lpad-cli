#!/usr/bin/env node

const EKD_VERSION = "0.1.0";
const DEFAULT_API_URL = "https://dns.ekddigital.com";
const CONFIG_DIR = process.env.EKD_CONFIG_DIR || `${process.env.HOME || ""}/.config/ekd`;
const CONFIG_PATH = `${CONFIG_DIR}/config.json`;

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

function color(code, text) {
    if (process.env.NO_COLOR === "1") return text;
    return `\x1b[${code}m${text}\x1b[0m`;
}

function ok(msg) { console.log(`${color("32", "OK")}: ${msg}`); }
function info(msg) { console.log(`${color("34", "->")}: ${msg}`); }
function warn(msg) { console.log(`${color("33", "!")}: ${msg}`); }
function fail(msg, code = 1) { console.error(`${color("31", "ERR")}: ${msg}`); process.exit(code); }

function ensureConfigDir() {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function readConfig() {
    try {
        if (!fs.existsSync(CONFIG_PATH)) return {};
        const raw = fs.readFileSync(CONFIG_PATH, "utf8");
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function writeConfig(nextConfig) {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2) + "\n", {
        encoding: "utf8",
        mode: 0o600,
    });
    try {
        fs.chmodSync(CONFIG_PATH, 0o600);
    } catch {
        // Ignore chmod failures on non-POSIX environments.
    }
}

function readHiddenInput(promptText) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });

        const originalWrite = rl._writeToOutput;
        rl._writeToOutput = function _writeMaskedOutput(stringToWrite) {
            if (rl.stdoutMuted) {
                rl.output.write("*");
            } else {
                originalWrite.call(rl, stringToWrite);
            }
        };

        rl.stdoutMuted = true;
        rl.question(promptText, (answer) => {
            rl.output.write("\n");
            rl.close();
            resolve(answer);
        });
    });
}

function getApiUrl(config) {
    return process.env.EKD_API_URL || config.apiUrl || DEFAULT_API_URL;
}

function getToken(config) {
    return process.env.EKD_TOKEN || config.token || "";
}

function parseArgs(argv) {
    const positional = [];
    const flags = {};

    for (let i = 0; i < argv.length; i += 1) {
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
                i += 1;
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

function helpText() {
    return `ekd v${EKD_VERSION}\n\nUsage:\n  ekd <command> [args] [flags]\n\nCore:\n  ekd login --email <email> --password <password>\n  ekd login --token <jwt>\n  ekd whoami\n  ekd logout\n\nProjects:\n  ekd projects list\n  ekd link <projectSlug>\n  ekd unlink\n\nDeploy:\n  ekd deploy [projectSlug] [--branch main] [--region us-east-1]\n  ekd push [projectSlug]         Alias of deploy\n\nEnvironment:\n  ekd env pull [projectSlug] [--environment production] [--output .env.production]\n  ekd env set [projectSlug] <KEY> <VALUE> [--environment production] [--secret] [--description text]\n  ekd pull [projectSlug]         Alias of env pull\n\nConfig:\n  ekd config get api\n  ekd config set api <url>\n\nOther:\n  ekd update\n  ekd version | -v | --version\n  ekd help\n`;
}

async function requestJson({ method, pathName, apiUrl, token, body }) {
    const url = `${apiUrl.replace(/\/$/, "")}${pathName}`;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!res.ok) {
        const msg = data?.message || data?.error || `HTTP ${res.status}`;
        throw new Error(msg);
    }

    return data;
}

function extractData(payload) {
    if (payload && typeof payload === "object") {
        if (Object.prototype.hasOwnProperty.call(payload, "data")) return payload.data;
        return payload;
    }
    return payload;
}

function resolveProject(config, arg) {
    const slug = arg || config.linkedProject;
    if (!slug) {
        fail("No project specified. Use `ekd link <projectSlug>` or pass the slug explicitly.");
    }
    return slug;
}

async function cmdLogin(config, flags) {
    const apiUrl = flags.api || getApiUrl(config);

    if (flags.token) {
        const next = { ...config, token: String(flags.token), apiUrl };
        writeConfig(next);
        ok("Token saved.");
        return;
    }

    if (!flags.email) {
        fail("Use --email and --password, or --token.");
    }

    let password = flags.password;
    if (!password) {
        password = await readHiddenInput("Password: ");
    }
    if (!password) {
        fail("Password is required.");
    }

    const payload = await requestJson({
        method: "POST",
        pathName: "/api/auth/login",
        apiUrl,
        body: { email: String(flags.email), password: String(password) },
    });

    const data = extractData(payload);
    const token = data?.token;
    if (!token) {
        fail("Login succeeded but no token returned by API.");
    }

    const next = { ...config, token, apiUrl, user: data.user || null };
    writeConfig(next);
    ok(`Logged in${data?.user?.email ? ` as ${data.user.email}` : ""}.`);
}

async function cmdWhoami(config) {
    const apiUrl = getApiUrl(config);
    const token = getToken(config);
    if (!token) fail("Not logged in. Run `ekd login`.");

    const payload = await requestJson({ method: "GET", pathName: "/api/auth/me", apiUrl, token });
    const data = extractData(payload);
    const user = data.user || data;

    console.log(`email: ${user.email || "unknown"}`);
    console.log(`name: ${user.name || ""}`);
    console.log(`role: ${user.role || ""}`);
}

function cmdLogout(config) {
    const next = { ...config };
    delete next.token;
    delete next.user;
    writeConfig(next);
    ok("Logged out.");
}

async function cmdProjectsList(config) {
    const apiUrl = getApiUrl(config);
    const token = getToken(config);
    if (!token) fail("Not logged in. Run `ekd login`.");

    const payload = await requestJson({ method: "GET", pathName: "/api/projects", apiUrl, token });
    const data = extractData(payload);
    const projects = Array.isArray(data) ? data : data.projects || [];

    if (!projects.length) {
        info("No projects found.");
        return;
    }

    for (const p of projects) {
        console.log(`${p.slug || p.id}  ${p.name || ""}`);
    }
}

function cmdLink(config, projectSlug) {
    if (!projectSlug) fail("Usage: ekd link <projectSlug>");
    const next = { ...config, linkedProject: projectSlug };
    writeConfig(next);
    ok(`Linked default project: ${projectSlug}`);
}

function cmdUnlink(config) {
    const next = { ...config };
    delete next.linkedProject;
    writeConfig(next);
    ok("Unlinked default project.");
}

async function cmdDeploy(config, projectArg, flags) {
    const apiUrl = getApiUrl(config);
    const token = getToken(config);
    if (!token) fail("Not logged in. Run `ekd login`.");

    const projectSlug = resolveProject(config, projectArg);

    const body = {
        branch: String(flags.branch || "main"),
        region: String(flags.region || "us-east-1"),
        ssl: flags["no-ssl"] ? false : true,
        cdn: Boolean(flags.cdn),
        analytics: flags["no-analytics"] ? false : true,
    };

    if (flags["custom-domain"]) body.customDomain = String(flags["custom-domain"]);

    const payload = await requestJson({
        method: "POST",
        pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deploy`,
        apiUrl,
        token,
        body,
    });

    const data = extractData(payload);
    const deployment = data.deployment || data;
    ok(`Deployment started: ${deployment.deploymentId || deployment.id || "unknown"}`);
    if (deployment.url) info(`URL: ${deployment.url}`);
}

async function cmdEnvPull(config, projectArg, flags) {
    const apiUrl = getApiUrl(config);
    const token = getToken(config);
    if (!token) fail("Not logged in. Run `ekd login`.");

    const projectSlug = resolveProject(config, projectArg);
    const envName = String(flags.environment || "production").toLowerCase();
    const output = String(flags.output || `.env.${envName}`);

    const payload = await requestJson({
        method: "GET",
        pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
        apiUrl,
        token,
    });

    const data = extractData(payload);
    const vars = Array.isArray(data.variables) ? data.variables : [];

    const filtered = vars.filter((v) => {
        const current = String(v.environment || "").toLowerCase();
        return current === envName || current === "all";
    });

    const lines = filtered.map((v) => `${v.key}=${String(v.value).replace(/\n/g, "\\n")}`);
    fs.writeFileSync(path.resolve(output), lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
    ok(`Wrote ${filtered.length} variable(s) to ${output}`);
}

async function cmdEnvSet(config, args, flags) {
    const apiUrl = getApiUrl(config);
    const token = getToken(config);
    if (!token) fail("Not logged in. Run `ekd login`.");

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

    if (!projectSlug) fail("No project specified. Use `ekd link <projectSlug>` or pass it explicitly.");
    if (!key || value === undefined) {
        fail("Usage: ekd env set [projectSlug] <KEY> <VALUE> [--environment production] [--secret]");
    }

    const body = {
        key: String(key),
        value: String(value),
        environment: String(flags.environment || "production"),
        isSecret: Boolean(flags.secret),
        description: flags.description ? String(flags.description) : undefined,
    };

    await requestJson({
        method: "POST",
        pathName: `/api/projects/${encodeURIComponent(projectSlug)}/environment`,
        apiUrl,
        token,
        body,
    });

    ok(`Saved ${key} for ${projectSlug} (${body.environment})`);
}

async function cmdConfig(config, args) {
    const [sub, key, value] = args;
    if (sub === "get") {
        if (key === "api") {
            console.log(getApiUrl(config));
            return;
        }
        fail("Usage: ekd config get api");
    }

    if (sub === "set") {
        if (key === "api" && value) {
            const next = { ...config, apiUrl: value };
            writeConfig(next);
            ok(`apiUrl set to ${value}`);
            return;
        }
        fail("Usage: ekd config set api <url>");
    }

    fail("Usage: ekd config <get|set> api [value]");
}

async function cmdUpdate(config) {
    const repo = process.env.EKD_CLI_REPO || "ekddigital/ekd-cli";
    const installer = `https://raw.githubusercontent.com/${repo}/main/install.sh`;
    info(`Update via: curl -fsSL ${installer} | bash`);
    info("Run the command above to update ekd globally.");
}

async function main() {
    const argv = process.argv.slice(2);
    const { positional, flags } = parseArgs(argv);

    if (flags.version || positional[0] === "version") {
        console.log(`ekd v${EKD_VERSION}`);
        return;
    }

    if (flags.help || positional.length === 0 || positional[0] === "help") {
        process.stdout.write(helpText());
        return;
    }

    const command = positional[0];
    const args = positional.slice(1);
    const config = readConfig();

    try {
        if (command === "login") return await cmdLogin(config, flags);
        if (command === "whoami") return await cmdWhoami(config);
        if (command === "logout") return cmdLogout(config);

        if (command === "projects" && args[0] === "list") return await cmdProjectsList(config);

        if (command === "link") return cmdLink(config, args[0]);
        if (command === "unlink") return cmdUnlink(config);

        if (command === "deploy") return await cmdDeploy(config, args[0], flags);
        if (command === "push") return await cmdDeploy(config, args[0], flags);

        if (command === "env" && args[0] === "pull") return await cmdEnvPull(config, args[1], flags);
        if (command === "pull") return await cmdEnvPull(config, args[0], flags);
        if (command === "env" && args[0] === "set") return await cmdEnvSet(config, args.slice(1), flags);

        if (command === "config") return await cmdConfig(config, args);

        if (command === "update") return await cmdUpdate(config);

        fail(`Unknown command: ${command}`);
    } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
    }
}

main();
