import { info } from "../output";

export function cmdUpdate(): void {
  const repo = process.env.LPAD_CLI_REPO ?? "ekddigital/lpad-cli";
  const installer = `https://raw.githubusercontent.com/${repo}/main/install.sh`;
  info(`Update via: curl -fsSL ${installer} | bash`);
  info("Run the command above to update lpad globally.");
}
