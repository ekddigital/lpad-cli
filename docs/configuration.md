# Configuration

`lpad` stores configuration in a JSON file and respects several environment variables. No configuration is required beyond logging in — all defaults work out of the box.

---

## Config File

### Location (in precedence order)

| Priority | Path                                     | Condition                                        |
| -------- | ---------------------------------------- | ------------------------------------------------ |
| 1        | `$LPAD_CONFIG_DIR/config.json`           | If `LPAD_CONFIG_DIR` is set                      |
| 2        | `$XDG_CONFIG_HOME/lpad/config.json`      | If `XDG_CONFIG_HOME` is set (Linux/XDG standard) |
| 3        | `~/.config/lpad/config.json`             | Default on macOS and Linux                       |
| 4        | `%USERPROFILE%\.config\lpad\config.json` | Default on Windows (via `HOME`)                  |

The file is created automatically on first login.

### File Format

```json
{
  "token": "eyJhbGci...",
  "apiUrl": "https://lpad.ekddigital.com",
  "linkedProject": "my-project-slug",
  "user": {
    "email": "you@example.com",
    "name": "Your Name",
    "role": "owner"
  }
}
```

### File Permissions

The config file is written with mode `0600` (owner read/write only) on POSIX systems. On Windows, `chmod` is skipped gracefully.

---

## Environment Variables

Environment variables always take precedence over the config file.

| Variable          | Overrides            | Description                                                                               |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------- |
| `LPAD_API_URL`    | `config.apiUrl`      | API base URL for all requests                                                             |
| `LPAD_TOKEN`      | `config.token`       | Auth token (useful in CI pipelines)                                                       |
| `LPAD_CONFIG_DIR` | Config file location | Full path to the config directory                                                         |
| `NO_COLOR`        | Color output         | Set to any non-empty value to disable ANSI colors ([no-color.org](https://no-color.org/)) |
| `TERM=dumb`       | Color output         | Colors are automatically disabled on dumb terminals                                       |

---

## CI / Automation

For non-interactive environments (GitHub Actions, GitLab CI, Docker, etc.) use environment variables instead of a config file:

```yaml
# GitHub Actions example
env:
  LPAD_API_URL: https://lpad.ekddigital.com
  LPAD_TOKEN: ${{ secrets.LPAD_TOKEN }}
```

```bash
# Shell example
LPAD_TOKEN=eyJhbGci... lpad deployments list my-project-slug
```

Colors are automatically suppressed when stdout/stderr is not a TTY (e.g., log files, CI runners).

---

## Linked Project

Running `lpad link`, `lpad init`, or `lpad migrate` saves the project slug to the global config file. Any command that accepts an optional `[projectSlug]` argument will use this value when none is provided.

The link is also written to **`.lpad/manifest.json`** in the current working directory (see below). Project resolution order:

1. Explicit slug on the CLI
2. `.lpad/manifest.json` in the current directory or a parent folder
3. `linkedProject` in `~/.config/lpad/config.json`

Use explicit slug arguments if you work across multiple projects without a local `.lpad/` directory.

---

## Project directory (`.lpad/`)

When you run `lpad init`, `lpad link`, `lpad migrate`, or the first `lpad deploy` (when `.lpad/` is missing), the CLI creates a `.lpad/` folder in the project root automatically — **never create it manually**:

```
my-app/
├── .lpad/
│   ├── manifest.json   # slug, API URL, deploy target, assets templates, env hints
│   └── README.md       # explains the convention
├── lpad.config.json    # optional — deploy overrides (read by Launchpad server)
└── ...
```

### `manifest.json` schema (version 1)

The CLI auto-detects project type from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Dockerfile`, `lpad.config.json`, etc.

```json
{
  "version": 1,
  "project": {
    "slug": "my-app",
    "name": "My App",
    "type": "nextjs"
  },
  "lpad": {
    "apiUrl": "https://lpad.ekddigital.com",
    "linkedAt": "2026-06-20T12:00:00.000Z"
  },
  "deploy": {
    "target": "vps",
    "framework": "Next.js",
    "deployMode": "pm2",
    "runtime": "node",
    "buildCommand": "npm run build",
    "startCommand": "npm start",
    "outputDirectory": ".next",
    "platformDomain": "my-app.lpad.ekddigital.com",
    "productionDomain": "app.example.com",
    "defaultBranch": "main"
  },
  "assets": {
    "publicBaseUrl": "https://assets.andgroupco.com",
    "apiBaseUrl": "https://assets.andgroupco.com/api/v1",
    "clientId": "my-app",
    "projectName": "my-app",
    "cdnPathTemplate": "/assets/{clientId}/{projectName}/{assetType}/{filename}"
  },
  "env": {
    "hints": [
      {
        "key": "ASSETS_API_SECRET",
        "description": "Assets API secret (sk_…) — set via lpad env set",
        "secret": true,
        "required": true
      }
    ]
  }
}
```

| Field | Purpose |
|-------|---------|
| `version` | Manifest schema version (currently `1`) |
| `project` | Launchpad project slug, display name, and detected type (`nextjs`, `python`, `static`, `docker`, …) |
| `lpad` | Linked Launchpad API URL and link timestamp |
| `deploy` | VPS deploy target, framework, build/start hints, platform + production domains |
| `assets` | CDN / API URL templates for EKD Digital Assets |
| `env.hints` | Documentation for required server env vars (not values) |
| `nginx.routes` | Reverse-proxy route hints (generated per project type) |

**Never create `.lpad/` manually.** Run `lpad migrate` or `lpad init` from the project root.

**Secrets never go in `.lpad/`** — use `lpad env set` or the Launchpad dashboard.

### `lpad.config.json` vs `.lpad/manifest.json`

| File | Consumer | Purpose |
|------|----------|---------|
| `.lpad/manifest.json` | CLI + Launchpad (hints) | Link metadata, domains, assets URLs, env documentation |
| `lpad.config.json` | Launchpad deploy pipeline | `deployMode`, build/start commands, runtime overrides |

Both can coexist. Existing projects without `.lpad/` continue to work.

### Migration for existing projects

```bash
cd /path/to/your-app
lpad migrate                    # or: lpad link your-project-slug
# First deploy also bootstraps .lpad/ if missing:
lpad deploy --prod
git add .lpad/
```

`lpad migrate` and `lpad init` fetch domains from the Launchpad API when the project exists. Use `--force` to overwrite an existing manifest.

---

## API URL

The default API base URL is `https://lpad.ekddigital.com`. To change it permanently:

```bash
lpad config set api https://your-custom-endpoint.com
```

To override it for a single command:

```bash
LPAD_API_URL=https://staging.lpad.ekddigital.com lpad deploy
```

The CLI enforces HTTPS for all non-localhost API URLs when an auth token is present.
