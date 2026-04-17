# lpad — EKD Digital Launchpad CLI

Command-line interface for the **EKD Digital Launchpad** deployment platform.

## Install (one-line)

```bash
curl -fsSL https://raw.githubusercontent.com/ekddigital/ekd-cli/main/install.sh | bash
```

Or globally via npm:

```bash
npm install -g @ekddigital/lpad
```

Or link from source during development:

```bash
cd custom/ekd-cli
npm install
npm run build
npm link
```

## Configure API URL

```bash
lpad config set api https://lpad.ekddigital.com
lpad config get api
```

You can also set `LPAD_API_URL` for one-off overrides.

## Auth

```bash
lpad login --email you@example.com --password 'your-password'
lpad whoami
lpad logout
```

Token auth:

```bash
lpad login --token <jwt>
```

## Projects and Deploy

```bash
lpad projects list
lpad link my-project-slug
lpad deploy --branch main --region us-east-1
```

Or deploy by explicit project:

```bash
lpad deploy my-project-slug --custom-domain app.example.com
```

## Environment Variables

```bash
lpad env pull my-project-slug --environment production --output .env.production
lpad env set  my-project-slug API_URL https://api.example.com --environment production --secret
```

## Development

```bash
npm run build      # compile TypeScript → bin/lpad.js via esbuild
npm run typecheck  # tsc --noEmit (no output means clean)
npm run dev        # run src/index.ts directly via tsx (no build needed)
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
