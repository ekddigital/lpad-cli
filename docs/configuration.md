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

Running `lpad link <projectSlug>` saves the project slug to the config file. Any command that accepts an optional `[projectSlug]` argument will use this value when none is provided.

The link is global (stored in `~/.config/lpad/config.json`), not per-directory. Use explicit slug arguments if you work across multiple projects.

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
