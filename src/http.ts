interface RequestOptions {
  method: string;
  pathName: string;
  apiUrl: string;
  token?: string;
  body?: unknown;
}

/**
 * Reject plain-HTTP URLs when an Authorization header will be sent.
 * Localhost is exempted to support local development.
 */
function assertSecureTransport(url: string, hasToken: boolean): void {
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
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method: opts.method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

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
