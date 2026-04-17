import readline from "node:readline";
import { Writable } from "node:stream";
import { type Config, writeConfig, getApiUrl } from "../config";
import { requestJson, extractData } from "../http";
import { ok, warn, fail } from "../output";

interface LoginResponse {
  token?: string;
  user?: { email?: string; name?: string; role?: string };
}

async function readHiddenInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
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
      },
    }) as Writable & { muted: boolean };
    mutableStdout.muted = false;

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
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
