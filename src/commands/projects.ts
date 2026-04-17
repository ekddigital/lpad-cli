import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { fail, info } from "../output";

interface Project {
  slug?: string;
  id?: string;
  name?: string;
}

type ProjectsResponse = Project[] | { projects?: Project[] };

export async function cmdProjectsList(config: Config): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const payload = await requestJson<ProjectsResponse>({
    method: "GET",
    pathName: "/api/projects",
    apiUrl,
    token,
  });

  const data = extractData<ProjectsResponse>(payload);
  const projects: Project[] = Array.isArray(data)
    ? data
    : ((data as { projects?: Project[] }).projects ?? []);

  if (!projects.length) {
    info("No projects found.");
    return;
  }

  for (const p of projects) {
    console.log(`${p.slug ?? p.id}  ${p.name ?? ""}`);
  }
}
