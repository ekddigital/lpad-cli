export const VERSION = "0.1.0";
export const DEFAULT_API_URL = "https://lpad.ekddigital.com";

export const CONFIG_DIR =
  process.env.LPAD_CONFIG_DIR ?? `${process.env.HOME ?? ""}/.config/lpad`;

export const CONFIG_PATH = `${CONFIG_DIR}/config.json`;
