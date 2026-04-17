import { VERSION } from "./constants";
import { parseArgs } from "./args";
import { readConfig } from "./config";
import { fail } from "./output";
import { cmdLogin } from "./commands/login";
import { cmdWhoami } from "./commands/whoami";
import { cmdLogout } from "./commands/logout";
import { cmdProjectsList } from "./commands/projects";
import { cmdLink, cmdUnlink } from "./commands/link";
import { cmdDeploy } from "./commands/deploy";
import { cmdEnvPull, cmdEnvSet, cmdEnvList } from "./commands/env";
import { cmdConfig } from "./commands/config-cmd";
import { cmdUpdate } from "./commands/update";
import { cmdLogs } from "./commands/logs";
import { cmdDeploymentsList, cmdDeploymentsInspect } from "./commands/deployments";
import { cmdDomainsList } from "./commands/domains";

function helpText(): string {
  return [
    `lpad v${VERSION} — EKD Digital Launchpad CLI`,
    "",
    "Usage:",
    "  lpad <command> [args] [flags]",
    "",
    "Auth:",
    "  lpad login --email <email> --password <password>",
    "  lpad login --token <jwt>",
    "  lpad whoami",
    "  lpad logout",
    "",
    "Projects:",
    "  lpad projects list",
    "  lpad link <projectSlug>",
    "  lpad unlink",
    "",
    "Deploy:",
    "  lpad deploy [projectSlug] [--prod] [--branch main] [--region us-east-1]",
    "  lpad deploy [projectSlug] [--env KEY=VAL ...]  Inline env overrides",
    "  lpad push  [projectSlug]                       Alias of deploy",
    "",
    "Deployments:",
    "  lpad deployments list    [projectSlug] [--limit 10] [--production]",
    "  lpad deployments inspect <deploymentId> [projectSlug]",
    "",
    "Logs:",
    "  lpad logs [projectSlug] [deploymentId] [--follow | -f]",
    "",
    "Domains:",
    "  lpad domains [projectSlug]",
    "",
    "Environment:",
    "  lpad env list [projectSlug] [--environment production]",
    "  lpad env pull [projectSlug] [--environment production] [--output .env.production]",
    "  lpad env set  [projectSlug] <KEY> <VALUE> [--environment production] [--secret]",
    "  lpad pull [projectSlug]          Alias of env pull",
    "",
    "Config:",
    "  lpad config get api",
    "  lpad config set api <url>",
    "",
    "Other:",
    "  lpad update",
    "  lpad version | -v | --version",
    "  lpad help",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2));

  if (flags.version || positional[0] === "version") {
    console.log(`lpad v${VERSION}`);
    return;
  }

  if (flags.help || positional.length === 0 || positional[0] === "help") {
    process.stdout.write(helpText());
    return;
  }

  const [command, ...args] = positional;
  const config = readConfig();

  try {
    switch (command) {
      case "login":
        return void (await cmdLogin(config, flags));

      case "whoami":
        return void (await cmdWhoami(config));

      case "logout":
        return void cmdLogout(config);

      case "projects":
        if (args[0] === "list") return void (await cmdProjectsList(config));
        break;

      case "link":
        return void cmdLink(config, args[0]);

      case "unlink":
        return void cmdUnlink(config);

      case "deploy":
      case "push":
        return void (await cmdDeploy(config, args[0], flags));

      case "env":
        if (args[0] === "pull")
          return void (await cmdEnvPull(config, args[1], flags));
        if (args[0] === "set")
          return void (await cmdEnvSet(config, args.slice(1), flags));
        if (args[0] === "list")
          return void (await cmdEnvList(config, args[1], flags));
        break;

      case "pull":
        return void (await cmdEnvPull(config, args[0], flags));

      case "logs":
        return void (await cmdLogs(config, args, flags));

      case "deployments":
        if (args[0] === "inspect")
          return void (await cmdDeploymentsInspect(config, args[1], args[2]));
        // default sub-command is "list"
        return void (
          await cmdDeploymentsList(
            config,
            args[0] === "list" ? args[1] : args[0],
            flags,
          )
        );

      case "domains":
        return void (await cmdDomainsList(config, args[0]));

      case "config":
        return void cmdConfig(config, args);

      case "update":
        return void cmdUpdate();
    }

    fail(`Unknown command: ${command}. Run \`lpad help\` for usage.`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
