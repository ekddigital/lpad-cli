# ekd CLI

REST-first command line client for EKD Digital platform.

## Install (global)

```bash
npm install -g @ekddigital/ekd-cli
```

Or from local source during development:

```bash
cd custom/ekd-cli
npm link
```

## Configure API URL

```bash
ekd config set api https://dns.ekddigital.com
ekd config get api
```

You can also set `EKD_API_URL` for one-off runs.

## Auth

```bash
ekd login --email you@example.com --password 'your-password'
ekd whoami
ekd logout
```

Token auth is also supported:

```bash
ekd login --token <jwt>
```

## Projects and Deploy

```bash
ekd projects list
ekd link my-project-slug
ekd deploy --branch main --region us-east-1
```

Or deploy by explicit project:

```bash
ekd deploy my-project-slug --custom-domain app.example.com
```

## Environment Variables

```bash
ekd env pull my-project-slug --environment production --output .env.production
ekd env set my-project-slug API_URL https://api.example.com --environment production --secret
```

## Command Summary

- `ekd login`
- `ekd whoami`
- `ekd logout`
- `ekd config get api`
- `ekd config set api <url>`
- `ekd projects list`
- `ekd link <projectSlug>`
- `ekd unlink`
- `ekd deploy [projectSlug] [flags]`
- `ekd env pull [projectSlug] [flags]`
- `ekd env set [projectSlug] <KEY> <VALUE> [flags]`
