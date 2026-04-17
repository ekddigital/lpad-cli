import readline from "node:readline";
import { type Config, writeConfig, getApiUrl } from "../config";
import { requestJson, extractData } from "../http";
import { ok, warn, fail } from "../output";

interface LoginResponse {
  token?: string;
  user?: { email?: string; name?: string; role?: string };
}

async function readHiddenInput(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rlAny = rl as any;
    const originalWrite = rlAny._writeToOutput as (s: string) => void;

    rlAny._writeToOutput = (s: string) => {
      if (rlAny.stdoutMuted) rlAny.output?.write("*");
      else originalWrite.call(rl, s);
    };

    rlAny.stdoutMuted = true;
    rl.question(prompt, (answer) => {
      rlAny.output?.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

export async function cmdLogin(
  config: Config,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = String(flags.api ?? getApiUrl(config));

  if (flags.token) {
    writeConfig({ ...config, token: String(flags.token), apiUrl });
    ok("Token saved.");
    return;
  }

  if (!flags.email) fail("Use --email and --password, or --token.");

  if (flags.password) {
    warn(
      "--password is visible in shell history and process lists (ps aux). " +
        "Omit it to be prompted securely instead.",
    );
  }

  const password = flags.password
    ? String(flags.password)
    : await readHiddenInput("Password: ");

  if (!password) fail("Password is required.");

  const payload = await requestJson<LoginResponse>({
    method: "POST",
    pathName: "/api/auth/login",
    apiUrl,
    body: { email: String(flags.email), password },
  });

  const data = extractData<LoginResponse>(payload);
  const token = data?.token;
  if (!token) fail("Login succeeded but no token returned by API.");

  writeConfig({ ...config, token, apiUrl, user: data.user ?? null });
  ok(`Logged in${data?.user?.email ? ` as ${data.user.email}` : ""}.`);
}
