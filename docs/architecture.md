# Architecture

This document describes the internal structure of the `lpad` CLI codebase.

---

## Overview

`lpad` is a single-binary CLI written in **TypeScript** (strict mode), built with **esbuild** into a self-contained Node.js script (`bin/lpad.js`). It has zero runtime dependencies — everything is bundled at build time.

```
src/
├── index.ts          # Entry point — argument parsing and command routing
├── constants.ts      # VERSION, DEFAULT_API_URL, CONFIG_DIR, CONFIG_PATH
├── args.ts           # Argument/flag parser (no third-party deps)
├── config.ts         # Read/write config.json
├── http.ts           # Fetch wrapper (requestJson, streamLogs)
├── output.ts         # Terminal output (ok, info, warn, fail, isColorEnabled)
├── project.ts        # Resolve the active project slug
└── commands/
    ├── login.ts        # lpad login
    ├── logout.ts       # lpad logout
    ├── whoami.ts       # lpad whoami
    ├── projects.ts     # lpad projects list
    ├── link.ts         # lpad link / lpad unlink
    ├── deploy.ts       # lpad deploy / lpad push
    ├── deployments.ts  # lpad deployments list / inspect
    ├── logs.ts         # lpad logs (SSE streaming)
    ├── domains.ts      # lpad domains
    ├── env.ts          # lpad env list / pull / set
    ├── config-cmd.ts   # lpad config get/set
    └── update.ts       # lpad update
```

---

## Module Responsibilities

### `src/index.ts`

The main entry point. It:
1. Calls `parseArgs()` to split `process.argv` into `[command, subcommand, positionalArgs, flags]`.
2. Calls `readConfig()` to load `~/.config/lpad/config.json`.
3. Routes the command to the appropriate handler function.
4. Prints help text for unknown commands.

### `src/constants.ts`

Single source of truth for:
- `VERSION` — matches `package.json` version.
- `DEFAULT_API_URL` — `https://lpad.ekddigital.com`.
- `CONFIG_DIR` — resolved from `LPAD_CONFIG_DIR` → `XDG_CONFIG_HOME` → `~/.config/lpad`.
- `CONFIG_PATH` — `CONFIG_DIR + "/config.json"`.

### `src/args.ts`

A lightweight argument parser that produces:
```typescript
{ positional: string[], flags: Record<string, string | boolean> }
```
Supports:
- Long flags: `--flag`, `--flag value`, `--flag=value`
- Short flags: `-f` (boolean), `-f value`
- Boolean flags (no value): `--prod`, `--follow`, `--production`

### `src/config.ts`

Manages `~/.config/lpad/config.json`:
- `readConfig()` — reads and parses the file; returns `{}` on missing/corrupt file.
- `writeConfig(config)` — writes atomically with mode `0o600`.
- `getApiUrl(config)` — resolves: `LPAD_API_URL` env var → `config.apiUrl` → `DEFAULT_API_URL`.
- `getToken(config)` — resolves: `LPAD_TOKEN` env var → `config.token` → `""`.

### `src/http.ts`

The HTTP layer wrapping the native `fetch` API (Node ≥ 18):
- `requestJson(opts)` — sends a JSON request with `AbortController` timeout (default 30 s), HTTPS enforcement, and `User-Agent: lpad-cli/<version>`.
- `extractData(payload)` — unwraps `{ data: ... }` envelope or returns the payload directly.
- `assertSecureTransport(url, hasToken)` — throws if a non-localhost HTTP URL is used with an auth token.
- `sanitize(str)` — strips ANSI escape codes and non-printable control characters from API-returned strings before printing.

### `src/output.ts`

All terminal output goes through this module:
- `ok(msg)` — `OK: msg` in green, written to **stderr**.
- `info(msg)` — `->: msg` in blue, written to **stderr**.
- `warn(msg)` — `!: msg` in yellow, written to **stderr**.
- `fail(msg, code?)` — `ERR: msg` in red, written to **stderr**, then `process.exit(code)`.
- `isColorEnabled(isTTY)` — returns `false` if `NO_COLOR` is set, `TERM=dumb`, or the stream is not a TTY.

Status messages go to **stderr**; data output (`console.log`) goes to **stdout**. This means `lpad deployments list | jq` works correctly — only structured data reaches the pipe.

### `src/project.ts`

`resolveProject(config, arg?)` — returns the project slug to use for a command, in this precedence:
1. Explicit argument passed on the CLI.
2. `config.linkedProject` (set by `lpad link`).
3. Calls `fail()` if neither is available.

### `src/commands/*`

Each command is a standalone async function (e.g. `cmdDeploy(config, projectArg, flags)`). Commands:
- Validate inputs with `fail()` for early exit.
- Call `requestJson()` for API calls.
- Print data to **stdout** with `console.log`.
- Print status to **stderr** with `ok/info/warn/fail`.

---

## Build Pipeline

```
TypeScript source (src/)
    ↓  esbuild (bundle + minify=false + target=node20)
bin/lpad.js   ← shebang: #!/usr/bin/env node
```

- **No runtime dependencies** — all code is bundled by esbuild.
- `tsconfig.json` — `strict: true`, `moduleResolution: bundler`, `noEmit: true` (tsc is type-check only).
- Build output: a single `bin/lpad.js` file (~150 KB unminified).

---

## Security Properties

| Concern | Mitigation |
|---|---|
| Credentials over HTTP | `assertSecureTransport()` blocks non-localhost HTTP when a token is present |
| Token file exposure | Config written `0o600`; only the owner can read it |
| ANSI injection from API | `sanitize()` strips all escape sequences from API-returned strings |
| Shell history exposure | `--env` warns users at runtime; `readHiddenInput()` masks password entry |
| Request hangs | `AbortController` with 30-second timeout on all requests |
| SSE stream hangs | Same `AbortController` pattern used in `streamLogs()` |

---

## Data Flow

```
User → lpad <cmd> [args] [flags]
           │
           ▼
       index.ts (route)
           │
           ▼
     commands/<cmd>.ts
           │
           ├─ config.ts ──── ~/.config/lpad/config.json
           ├─ project.ts ─── resolves project slug
           ├─ http.ts ────── fetch → https://lpad.ekddigital.com/api/...
           │                         (User-Agent, timeout, HTTPS enforcement)
           └─ output.ts ──── ok/info/warn/fail → stderr
                             console.log(data) → stdout
```
