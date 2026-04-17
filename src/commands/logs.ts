import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData, assertSecureTransport, sanitize } from "../http";
import { fail, info, ok } from "../output";
import { resolveProject } from "../project";

interface BuildLog {
  id: string;
  timestamp: string;
  level: string;
  message: string;
}

interface Deployment {
  id: string;
  status: string;
  completedAt?: string;
  buildTime?: number;
}

interface LogsSnapshot {
  logs: BuildLog[];
  deployment: Deployment;
}

/** ANSI colour per log level */
function levelColor(level: string, msg: string): string {
  if (process.env.NO_COLOR === "1") return msg;
  const codes: Record<string, string> = {
    error: "\x1b[31m",
    warn: "\x1b[33m",
    info: "\x1b[34m",
    debug: "\x1b[90m",
  };
  const reset = "\x1b[0m";
  return `${codes[level.toLowerCase()] ?? ""}${msg}${reset}`;
}

function printLog(log: BuildLog): void {
  const ts = new Date(log.timestamp).toLocaleTimeString();
  const lvl = log.level.toUpperCase().padEnd(5);
  // sanitize() strips ANSI escape codes and control chars injected by a
  // malicious/compromised server before we apply our own safe colouring.
  console.log(levelColor(log.level, `${ts}  ${lvl}  ${sanitize(log.message)}`));
}

/** Resolve a project's latest deployment ID if none is given */
async function resolveDeploymentId(
  projectSlug: string,
  deploymentArg: string | undefined,
  apiUrl: string,
  token: string,
): Promise<string> {
  if (deploymentArg) return deploymentArg;

  const payload = await requestJson<unknown>({
    method: "GET",
    pathName: `/api/projects/${encodeURIComponent(projectSlug)}/deployments?limit=1`,
    apiUrl,
    token,
  });

  const data = extractData<{ deployments?: Array<{ id: string }> }>(payload);
  const latest = (data?.deployments ?? [])[0];
  if (!latest?.id) {
    fail(`No deployments found for project "${projectSlug}".`);
  }
  return latest.id as string;
}

/**
 * Stream SSE events from the logs endpoint until the "done" event or the
 * connection closes. Requires Node ≥ 20 (fetch + ReadableStream).
 *
 * Security: assertSecureTransport is called before the fetch so credentials
 * are never sent over plain HTTP — the same guarantee as requestJson().
 */
async function streamLogs(
  logsUrl: string,
  token: string,
): Promise<void> {
  // Fix: assert HTTPS before sending the Bearer token (requestJson does this
  // automatically, but this path uses fetch directly).
  assertSecureTransport(logsUrl, true);

  // Stream timeout: 22 minutes matches the server's 20-minute max build time
  // plus a 2-minute grace period, preventing the CLI from hanging indefinitely.
  const STREAM_TIMEOUT_MS = 22 * 60 * 1_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(logsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      signal: controller.signal,
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
    let msg: string;
    try {
      msg = (JSON.parse(text) as Record<string, string>).error ?? text;
    } catch {
      msg = text;
    }
    fail(`Logs stream error: ${sanitize(msg)}`);
  }

  if (!res.body) { clearTimeout(timer); fail("No response body from logs stream."); }

  const reader = res.body!.getReader();
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
            printLog(JSON.parse(dataStr) as BuildLog);
          } catch { /* skip malformed */ }
        }

        if (event === "status") {
          try {
            const s = JSON.parse(dataStr) as { status?: string; buildTime?: number };
            const bt = s.buildTime ? ` (${(s.buildTime / 1000).toFixed(1)}s)` : "";
            info(`Status: ${sanitize(s.status ?? "unknown")}${bt}`);
          } catch { /* skip */ }
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function cmdLogs(
  config: Config,
  args: string[],
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  // lpad logs [projectSlug] [deploymentId]
  const projectArg = args[0] ?? config.linkedProject;
  if (!projectArg) {
    fail("Usage: lpad logs <projectSlug> [deploymentId] [--follow]");
  }
  const projectSlug = resolveProject(config, projectArg as string);
  const deploymentArg = args[1];

  const deploymentId = await resolveDeploymentId(
    projectSlug,
    deploymentArg,
    apiUrl,
    token,
  );

  const logsBase = `/api/projects/${encodeURIComponent(projectSlug)}/deployments/${encodeURIComponent(deploymentId)}/logs`;
  const follow = flags.follow || flags.f;

  if (follow) {
    info(`Streaming logs for deployment ${deploymentId} — press Ctrl+C to stop`);
    console.log();
    await streamLogs(`${apiUrl}${logsBase}`, token);
    ok("Stream ended.");
  } else {
    // JSON snapshot
    const payload = await requestJson<LogsSnapshot>({
      method: "GET",
      pathName: `${logsBase}?format=json`,
      apiUrl,
      token,
    });

    const { logs, deployment } = payload;
    if (!logs || logs.length === 0) {
      info("No logs available for this deployment.");
      return;
    }

    console.log();
    for (const log of logs) printLog(log);
    console.log();

    const bt = deployment.buildTime
      ? ` — ${(deployment.buildTime / 1000).toFixed(1)}s`
      : "";
    ok(`Deployment ${deployment.id}  status: ${deployment.status}${bt}`);
  }
}
