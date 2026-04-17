# Development Guide

This guide covers the local development workflow for `lpad`.

---

## Requirements

- **Node.js ≥ 20** — the CLI targets Node 20 APIs (`fetch`, `AbortController`, ESM).
- **npm ≥ 9** — for package management.
- **TypeScript ≥ 5** — installed as a dev dependency; no global install needed.

---

## Setup

```bash
git clone https://github.com/ekddigital/lpad-cli.git
cd lpad-cli
npm install
```

---

## Common Commands

| Command              | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `npm run build`      | Bundle `src/index.ts` → `bin/lpad.js` via esbuild              |
| `npm run typecheck`  | Type-check without emitting files (`tsc --noEmit`)             |
| `npm run dev`        | Run the CLI directly from TypeScript via `tsx` (no build step) |
| `npm run test:smoke` | Run `bin/lpad.js --help` to verify the build works             |

### Development mode (no build required)

`tsx` transpiles TypeScript on the fly:

```bash
npm run dev -- login --email you@example.com --password secret
npm run dev -- deploy my-project-slug --branch main
```

This is faster than rebuilding for iterative development.

---

## Project Structure

```
lpad-cli/
├── src/                  # TypeScript source
│   ├── index.ts          # Entry point and router
│   ├── constants.ts      # VERSION, config paths, default URL
│   ├── args.ts           # Argument parser
│   ├── config.ts         # Config file read/write
│   ├── http.ts           # HTTP client (fetch wrapper)
│   ├── output.ts         # Terminal output helpers
│   ├── project.ts        # Project slug resolution
│   └── commands/         # One file per command group
├── bin/
│   └── lpad.js           # Built output (committed for one-line install)
├── docs/                 # This documentation
├── build.mjs             # esbuild build script
├── tsconfig.json         # TypeScript config
├── package.json
├── install.sh            # macOS/Linux installer
├── install.ps1           # Windows installer
└── uninstall.sh          # macOS/Linux uninstaller
```

See [architecture.md](./architecture.md) for a full description of each module.

---

## Adding a New Command

1. **Create** `src/commands/my-command.ts`:

```typescript
import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { ok, fail } from "../output";

export async function cmdMyCommand(
  config: Config,
  flags: Record<string, string | boolean>,
): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const payload = await requestJson<{ result: string }>({
    method: "GET",
    pathName: "/api/my-endpoint",
    apiUrl,
    token,
  });

  const data = extractData<{ result: string }>(payload);
  console.log(data.result); // stdout — data for piping
  ok("Done."); // stderr — status message
}
```

2. **Import and wire** in `src/index.ts`:

```typescript
import { cmdMyCommand } from "./commands/my-command";

// Inside the switch/if chain:
case "my-command":
  await cmdMyCommand(config, flags);
  break;
```

3. **Add help text** in the `helpText()` function in `src/index.ts`.

4. **Build and test**:

```bash
npm run typecheck
npm run build
node bin/lpad.js my-command --help
```

---

## Code Style

- **TypeScript strict mode** — all `strict: true` checks enabled.
- **ESM** — `"type": "module"` in `package.json`. Use `import`/`export`, never `require`.
- **No runtime dependencies** — keep it zero-dependency. esbuild bundles everything.
- **Status → stderr, data → stdout** — use `ok/info/warn/fail` for status; `console.log` for data.
- **Errors terminate via `fail()`** — never `throw` uncaught errors at the command level.
- **Input from API must be sanitized** — pass strings from API responses through `sanitize()` before printing.

---

## Release Process

1. Bump `VERSION` in `src/constants.ts` and `"version"` in `package.json` (keep them in sync).
2. Run `npm run typecheck && npm run build`.
3. Commit the updated `bin/lpad.js` along with source changes.
4. Tag the commit: `git tag v0.x.y && git push --tags`.
5. Publish to npm: `npm publish --access public`.

The pre-built `bin/lpad.js` is committed to the repository so the one-line shell/PowerShell installers can download it without requiring npm.

---

## Environment Variables (dev overrides)

| Variable          | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `LPAD_API_URL`    | Point at a local or staging API (`http://localhost:3000`) |
| `LPAD_TOKEN`      | Use a hardcoded token without running `lpad login`        |
| `LPAD_CONFIG_DIR` | Use an isolated config directory during testing           |
| `NO_COLOR=1`      | Disable ANSI colors in test output                        |
