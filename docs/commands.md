# Command Reference

Complete reference for every `lpad` command.

---

## Auth

### `lpad login`

Authenticate with the Launchpad API and save credentials locally.

```bash
# Interactive (email + password)
lpad login --email you@example.com --password 'your-password'

# JWT token (non-interactive / CI)
lpad login --token <jwt>
```

| Flag         | Description                             |
| ------------ | --------------------------------------- |
| `--email`    | Your account email                      |
| `--password` | Your account password (input is masked) |
| `--token`    | Raw JWT — bypasses email/password flow  |
| `--api`      | Override API URL for this login only    |

> **Note:** The password prompt masks input with `*` characters. The token is stored in `~/.config/lpad/config.json` with mode `0600`.

---

### `lpad whoami`

Print the currently authenticated user.

```bash
lpad whoami
```

---

### `lpad logout`

Remove the saved token and user info from local config.

```bash
lpad logout
```

---

## Projects

### `lpad projects list`

List all projects accessible to your account.

```bash
lpad projects list
```

---

### `lpad link <projectSlug>`

Link the current working directory to a project. Saves the slug to the local config so you don't have to pass it to every command.

```bash
lpad link my-project-slug
```

---

### `lpad unlink`

Remove the project link from the current directory's config.

```bash
lpad unlink
```

---

## Deploy

### `lpad deploy [projectSlug]`

Trigger a deployment. If `projectSlug` is omitted, uses the linked project.

```bash
lpad deploy
lpad deploy my-project-slug
lpad deploy --prod
lpad deploy --branch feature/new-ui
lpad deploy --region eu-west-1
lpad deploy --env API_URL=https://api.example.com --env DEBUG=1
```

| Flag              | Default     | Description                               |
| ----------------- | ----------- | ----------------------------------------- |
| `--prod`          | `false`     | Mark as a production deployment           |
| `--branch`        | `main`      | Git branch to deploy                      |
| `--region`        | `us-east-1` | Deployment region                         |
| `--cdn`           | `false`     | Enable CDN                                |
| `--no-ssl`        | —           | Disable SSL (not recommended)             |
| `--no-analytics`  | —           | Disable analytics                         |
| `--custom-domain` | —           | Attach a custom domain                    |
| `--env KEY=VAL`   | —           | Inline environment overrides (repeatable) |

> **Security:** `--env` values are visible in shell history. Use `lpad env set` for persistent secrets.

### `lpad push [projectSlug]`

Alias for `lpad deploy`.

---

## Deployments

### `lpad deployments list [projectSlug]`

List recent deployments for a project.

```bash
lpad deployments list
lpad deployments list my-project-slug --limit 20
lpad deployments list --production
```

| Flag           | Default | Description                      |
| -------------- | ------- | -------------------------------- |
| `--limit`      | `10`    | Number of deployments to show    |
| `--production` | `false` | Show only production deployments |

---

### `lpad deployments inspect <deploymentId> [projectSlug]`

Show full details for a single deployment.

```bash
lpad deployments inspect dep_abc123
lpad deployments inspect dep_abc123 my-project-slug
```

---

## Logs

### `lpad logs [projectSlug] [deploymentId]`

Stream or tail build/runtime logs.

```bash
lpad logs
lpad logs my-project-slug
lpad logs my-project-slug dep_abc123
lpad logs --follow
lpad logs -f
```

| Flag              | Description                    |
| ----------------- | ------------------------------ |
| `--follow` / `-f` | Stream logs in real time (SSE) |

> Logs stream over HTTPS using Server-Sent Events (SSE). The connection times out after 5 minutes of inactivity.

---

## Domains

### `lpad domains [projectSlug]`

List domains attached to a project.

```bash
lpad domains
lpad domains my-project-slug
```

---

## Environment Variables

### `lpad env list [projectSlug]`

List environment variables for a project.

```bash
lpad env list
lpad env list my-project-slug --environment staging
```

| Flag            | Default      | Description        |
| --------------- | ------------ | ------------------ |
| `--environment` | `production` | Target environment |

---

### `lpad env pull [projectSlug]`

Download environment variables into a local `.env` file.

```bash
lpad env pull
lpad env pull my-project-slug --environment staging --output .env.staging
```

| Flag            | Default              | Description        |
| --------------- | -------------------- | ------------------ |
| `--environment` | `production`         | Source environment |
| `--output`      | `.env.<environment>` | Output file path   |

### `lpad pull [projectSlug]`

Alias for `lpad env pull`.

---

### `lpad env set [projectSlug] <KEY> <VALUE>`

Set (or update) a single environment variable.

```bash
lpad env set my-project-slug API_URL https://api.example.com
lpad env set my-project-slug DB_PASSWORD s3cret --environment production --secret
```

| Flag            | Default      | Description                               |
| --------------- | ------------ | ----------------------------------------- |
| `--environment` | `production` | Target environment                        |
| `--secret`      | `false`      | Mark the value as a secret (masked in UI) |

---

## Config

### `lpad config get api`

Print the currently configured API URL.

```bash
lpad config get api
```

### `lpad config set api <url>`

Override the API base URL (stored in local config).

```bash
lpad config set api https://lpad.ekddigital.com
```

The URL must use HTTPS unless it is `localhost` or `127.0.0.1`.

---

## Other

### `lpad update`

Check for a newer version on GitHub and print upgrade instructions.

```bash
lpad update
```

### `lpad version` / `lpad -v` / `lpad --version`

Print the current version.

```bash
lpad --version
```

### `lpad help` / `lpad --help` / `lpad -h`

Print the full command reference.

```bash
lpad --help
```
