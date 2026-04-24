# lpad — EKD Digital Launchpad CLI

Command-line interface for the **EKD Digital Launchpad** deployment platform.

```
lpad deploy --prod --branch main
lpad logs --follow
lpad env pull --environment production
```

## Documentation

| Doc                                            | Description                                          |
| ---------------------------------------------- | ---------------------------------------------------- |
| [docs/installation.md](docs/installation.md)   | Install on macOS, Linux, and Windows                 |
| [docs/commands.md](docs/commands.md)           | Full command reference with all flags                |
| [docs/configuration.md](docs/configuration.md) | Config file, environment variables, CI usage         |
| [docs/architecture.md](docs/architecture.md)   | Codebase structure and module design                 |
| [docs/development.md](docs/development.md)     | Local dev workflow, adding commands, release process |

---

## Quick Start

### Install

**macOS / Linux** — one-line script (no npm required):

```bash
curl -fsSL https://raw.githubusercontent.com/ekddigital/lpad-cli/main/install.sh | bash
```

**Windows** — PowerShell (no admin required):

```powershell
irm https://raw.githubusercontent.com/ekddigital/lpad-cli/main/install.ps1 | iex
```

**Any OS** — via npm:

```bash
npm install -g @ekddigital/lpad
```

Requires **Node.js ≥ 20**. See [docs/installation.md](docs/installation.md) for all options.

### Authenticate

```bash
lpad login --email you@example.com --password 'your-password'
# or via GitHub device login:
lpad login --github
# or with a token (CI-friendly):
lpad login --token <jwt>
```

### Link a project

```bash
lpad projects list
lpad link my-project-slug
```

### Deploy

```bash
lpad deploy
lpad deploy --prod --branch main
```

### View logs

```bash
lpad logs --follow
```

### Pull environment variables

```bash
lpad env pull --environment production --output .env.production
```

---

## Requirements

- Node.js ≥ 20
- HTTPS access to `https://lpad.ekddigital.com` (or your configured API URL)

---

## Development

```bash
git clone https://github.com/ekddigital/lpad-cli.git
cd lpad-cli
npm install
npm run build       # → bin/lpad.js
npm run typecheck   # tsc --noEmit
npm run dev -- --help   # run without building
```

See [docs/development.md](docs/development.md) for the full workflow.
