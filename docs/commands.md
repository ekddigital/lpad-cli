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

### `lpad init <projectSlug>`

Initialize a project directory with a `.lpad/manifest.json` and link it to Launchpad.

```bash
lpad init towanpay
lpad init my-app --name "My App"
lpad init my-app --force
lpad init my-app --no-assets
```

| Flag | Description |
|------|-------------|
| `--name` | Project display name in the manifest |
| `--force` | Overwrite an existing manifest |
| `--no-assets` | Omit default Assets CDN templates |

Creates:

- `.lpad/manifest.json` — slug, API URL, deploy target, assets templates, env hints
- `.lpad/README.md` — explains the convention

Also updates `linkedProject` in `~/.config/lpad/config.json`.

---

### `lpad migrate [projectSlug]`

Scaffold or refresh `.lpad/` for an **existing** Launchpad project. Idempotent merge — safe to re-run. Also runs automatically on first `lpad deploy` when `.lpad/` is absent.

```bash
lpad migrate
lpad migrate towanpay
lpad migrate --force
lpad migrate --no-assets
```

| Flag | Description |
|------|-------------|
| `--force` | Overwrite manifest fields from Launchpad |
| `--no-assets` | Omit default Assets CDN templates |

---

### `lpad projects list`

List all projects accessible to your account.

```bash
lpad projects list
```

---

### `lpad link <projectSlug>`

Link the current working directory to a project. Saves the slug to the global config and creates or updates `.lpad/manifest.json` in the project root.

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

Trigger a deployment. If `projectSlug` is omitted, uses `.lpad/manifest.json`, then the linked project in `~/.config/lpad/config.json`.

On the **first deploy** when `.lpad/` is missing, the CLI auto-creates it from the resolved project slug (and Launchpad API when logged in).

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

## Organizations

Organizations group projects, teams, and members under a shared role hierarchy
(`OWNER` > `ADMIN` > `MAINTAINER` > `DEVELOPER` > `BILLING`/`AUDITOR` > `VIEWER`).

### `lpad org list`

List organizations you belong to.

```bash
lpad org list
```

### `lpad org create <name>`

```bash
lpad org create "Acme Inc." --slug acme --description "Acme's projects"
```

| Flag            | Description                               |
| --------------- | ------------------------------------------ |
| `--slug`        | Explicit slug (auto-generated if omitted) |
| `--description` | Optional description                      |

### `lpad org show <orgSlug>`

Print organization details and stats.

### `lpad org members list <orgSlug>`

List members and their roles.

### `lpad org members add <orgSlug> <email>`

Add an existing Launchpad user to the organization.

```bash
lpad org members add acme teammate@example.com --role DEVELOPER
```

### `lpad org members role <orgSlug> <userId> <role>`

Change a member's role. Cannot be used to change the owner's role.

### `lpad org members remove <orgSlug> <userId>`

Remove a member. Cannot be used to remove the owner.

---

## Teams

Teams live inside an organization.

### `lpad team list <orgSlug>`

### `lpad team create <orgSlug> <name>`

```bash
lpad team create acme "Platform Engineering" --slug platform
```

### `lpad team delete <orgSlug> <teamSlug>`

### `lpad team members add <orgSlug> <teamSlug> <userId>`

The user must already be a member of the organization.

```bash
lpad team members add acme platform usr_123 --role MAINTAINER
```

### `lpad team members remove <orgSlug> <teamSlug> <userId>`

---

## Issues & Pull Requests

Read-only mirror of a project's linked GitHub repository — GitHub remains the
source of truth. Requires the project to have a linked GitHub repository.

### `lpad issues sync [projectSlug]`

Fetch the latest issues and pull requests from GitHub into Launchpad.

### `lpad issues list [projectSlug]`

```bash
lpad issues list --state open
```

| Flag      | Description                              |
| --------- | ----------------------------------------- |
| `--state` | `open`, `closed`, or `all` (default `all`) |

### `lpad pr sync [projectSlug]`

Alias of `lpad issues sync` (one sync call refreshes both issues and PRs).

### `lpad pr list [projectSlug]`

```bash
lpad pr list --state open
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
