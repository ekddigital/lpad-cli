# Installation

`lpad` requires **Node.js ≥ 20**. There are three ways to install it.

---

## Option 1 — npm (recommended for most users)

This installs the CLI globally from the npm registry.

```bash
npm install -g @ekddigital/lpad
```

Verify:

```bash
lpad --version
```

---

## Option 2 — One-line script (no npm needed)

The installer downloads the pre-built `bin/lpad.js` directly from GitHub and adds it to your PATH. No npm, no `node_modules`.

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/ekddigital/lpad-cli/main/install.sh | bash
```

What the script does:

- Downloads `bin/lpad.js` from the latest `main` branch.
- Places it at `~/.local/bin/lpad` (configurable via `LPAD_INSTALL_DIR`).
- Appends an `export PATH` line to your shell rc file (`~/.zshrc`, `~/.bashrc`, or `~/.config/fish/config.fish`).

After install, run:

```bash
source ~/.zshrc   # or restart your terminal
lpad --help
```

**Environment variables that control the installer:**

| Variable             | Default               | Purpose                            |
| -------------------- | --------------------- | ---------------------------------- |
| `LPAD_INSTALL_DIR`   | `~/.local/bin`        | Where to place the `lpad` binary   |
| `LPAD_CLI_REPO`      | `ekddigital/lpad-cli` | Override GitHub repo (e.g. a fork) |
| `LPAD_NO_SHELL_HOOK` | `0`                   | Set to `1` to skip PATH injection  |

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/ekddigital/lpad-cli/main/install.ps1 | iex
```

What the script does:

- Downloads `bin/lpad.js` and a `lpad.cmd` wrapper.
- Places both in `%USERPROFILE%\.lpad\bin` (configurable via `LPAD_INSTALL_DIR`).
- Adds that directory to your user-scoped `PATH` permanently.

No administrator rights are required. Restart your terminal after install.

**Environment variables that control the installer:**

| Variable           | Default               | Purpose              |
| ------------------ | --------------------- | -------------------- |
| `LPAD_INSTALL_DIR` | `~\.lpad\bin`         | Where to install     |
| `LPAD_CLI_REPO`    | `ekddigital/lpad-cli` | Override GitHub repo |

---

## Option 3 — Build from source (development / contributors)

```bash
git clone https://github.com/ekddigital/lpad-cli.git
cd lpad-cli
npm install
npm run build
npm link          # makes `lpad` available globally on this machine
```

See [development.md](./development.md) for the full development workflow.

---

## Uninstall

### npm

```bash
npm uninstall -g @ekddigital/lpad
```

### Script-installed (macOS / Linux)

```bash
rm ~/.local/bin/lpad
```

Then remove the PATH line from your rc file.

### Script-installed (Windows)

Delete `%USERPROFILE%\.lpad\bin` and remove it from your PATH via System Properties → Environment Variables.

### Source / npm link

```bash
npm unlink -g @ekddigital/lpad
```
