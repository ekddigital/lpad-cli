import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { fail } from "../output";

interface UserProfile {
  email?: string;
  name?: string;
  role?: string;
}

interface WhoamiResponse {
  user?: UserProfile;
  email?: string;
  name?: string;
  role?: string;
}

export async function cmdWhoami(config: Config): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const payload = await requestJson<WhoamiResponse>({
    method: "GET",
    pathName: "/api/auth/me",
    apiUrl,
    token,
  });

  const data = extractData<WhoamiResponse>(payload);
  const user: UserProfile = data.user ?? data;

  console.log(`email: ${user.email ?? "unknown"}`);
  console.log(`name:  ${user.name ?? ""}`);
  console.log(`role:  ${user.role ?? ""}`);
}
