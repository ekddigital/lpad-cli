import { VERSION } from "./constants";

interface RequestOptions {
  method: string;
  pathName: string;
  apiUrl: string;
  token?: string;
  body?: unknown;
  /** Request timeout in ms. Defaults to 30 000. Pass 0 to disable. */
  timeoutMs?: number;
}

/**
 * Strip ANSI escape sequences and other non-printable control characters
 * from a string returned by the API before printing to the terminal.
 * Preserves tab (\t) and newline (\n).
 */
export function sanitize(s: string): string {
  // Remove CSI / OSC / ESC sequences
  // eslint-disable-next-line no-control-regex
  return (
    s
      .replace(/\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07)/g, "")
      // Remove any remaining raw control chars except \t and \n
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
  );
}

/**
 * Reject plain-HTTP URLs when an Authorization header will be sent.
 * Localhost is exempted to support local development.
 */
export function assertSecureTransport(url: string, hasToken: boolean): void {
  if (!hasToken) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid API URL: "${url}"`);
  }
  const isLocal =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocal) {
    throw new Error(
      `Refusing to send credentials over plain HTTP to "${parsed.host}". ` +
        "Set the API URL to an HTTPS endpoint or use LPAD_API_URL.",
    );
  }
}

export async function requestJson<T = unknown>(
  opts: RequestOptions,
): Promise<T> {
  const url = `${opts.apiUrl.replace(/\/$/, "")}${opts.pathName}`;

  assertSecureTransport(url, Boolean(opts.token));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Sent with every request so server logs can identify the CLI version.
    // Recommended by 12-factor CLI apps §3.
    "User-Agent": `lpad-cli/${VERSION}`,
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller?.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${timeoutMs / 1000}s. Check your network or API URL.`,
      );
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = data as Record<string, string>;
    throw new Error(err?.message ?? err?.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}

export function extractData<T = unknown>(payload: unknown): T {
  if (payload !== null && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}
