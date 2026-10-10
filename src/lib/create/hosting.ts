/**
 * Hosting adapter for published user projects.
 * Copies the draft into deploys/<project>/<deploy>/ in blob storage and serves it
 * from /sites/<slug>/. Wildcard hosting on the user-content domain (one
 * multi-tenant project, files in R2) is the next step; until then the address is
 * the /sites path.
 */
import { blobs } from "./platform/blob";
import { isLive, LOCAL_SITES_BASE, USER_CONTENT_DOMAIN } from "./platform/config";
import { id, now } from "./platform/ids";
import { deployPrefix, draftPrefix } from "./projects";
import { deploys, projects } from "./repo";
import type { Deploy, Project } from "./types";

export function siteUrls(p: Pick<Project, "slug">) {
  return {
    /** Address once wildcard hosting is set up. */
    production: `https://${p.slug}.${USER_CONTENT_DOMAIN}`,
    /** Works right now. */
    local: `${LOCAL_SITES_BASE}/${p.slug}/`,
  };
}

export async function deployProject(project: Project): Promise<Deploy> {
  const deployId = id("dpl");
  const from = draftPrefix(project, project.draftVersion);
  const to = deployPrefix(project.id, deployId);
  for (const key of await blobs().list(from)) {
    const b = await blobs().get(key);
    if (b) await blobs().put(to + key.slice(from.length), b.body, b.contentType);
  }
  const urls = siteUrls(project);
  const deploy: Deploy = {
    id: deployId,
    workspaceId: project.workspaceId,
    projectId: project.id,
    version: project.draftVersion,
    url: isLive("hosting") ? urls.production : urls.local,
    provider: isLive("hosting") ? "vercel" : "local",
    status: "ready",
    createdAt: now(),
  };
  await deploys().insert(deploy);
  await projects().update(project.workspaceId, project.id, { liveDeployId: deployId, publishedAt: deploy.createdAt, updatedAt: deploy.createdAt });
  return deploy;
}

export async function unpublish(project: Project) {
  await projects().update(project.workspaceId, project.id, { liveDeployId: null, publishedAt: null, updatedAt: now() });
}
