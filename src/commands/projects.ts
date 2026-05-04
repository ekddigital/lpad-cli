import { type Config, getApiUrl, getToken } from "../config";
import { requestJson, extractData } from "../http";
import { fail, info } from "../output";

interface Project {
  slug?: string;
  id?: string;
  name?: string;
}

interface PaginatedProjectsResponse {
  projects?: Project[];
  pagination?: {
    page?: number;
    totalPages?: number;
    hasNextPage?: boolean;
  };
}

type ProjectsResponse = Project[] | PaginatedProjectsResponse;

function normalizeProjects(payload: ProjectsResponse): {
  projects: Project[];
  hasNextPage: boolean;
  page: number;
  totalPages: number;
} {
  if (Array.isArray(payload)) {
    return {
      projects: payload,
      hasNextPage: false,
      page: 1,
      totalPages: 1,
    };
  }

  const projects = payload.projects ?? [];
  const page = payload.pagination?.page ?? 1;
  const totalPages = payload.pagination?.totalPages ?? 1;
  const hasNextPage = payload.pagination?.hasNextPage ?? page < totalPages;

  return { projects, hasNextPage, page, totalPages };
}

export async function cmdProjectsList(config: Config): Promise<void> {
  const apiUrl = getApiUrl(config);
  const token = getToken(config);
  if (!token) fail("Not logged in. Run `lpad login`.");

  const allProjects: Project[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    const payload = await requestJson<ProjectsResponse>({
      method: "GET",
      pathName: `/api/projects?page=${page}&limit=100`,
      apiUrl,
      token,
    });

    const data = extractData<ProjectsResponse>(payload);
    const normalized = normalizeProjects(data);
    allProjects.push(...normalized.projects);

    // Guard against inconsistent pagination metadata to avoid infinite loops.
    if (normalized.totalPages <= normalized.page) {
      hasNextPage = false;
    } else {
      hasNextPage = normalized.hasNextPage;
    }
    page += 1;
  }

  if (!allProjects.length) {
    info("No projects found.");
    return;
  }

  for (const p of allProjects) {
    console.log(`${p.slug ?? p.id}  ${p.name ?? ""}`);
  }
}
