import { assertSameAccount } from "@/lib/accounts/account-guard";
import { body, errorResponse, HttpError, json } from "@/lib/create/platform/http";
import { rateLimit } from "@/lib/create/platform/ratelimit";
import { currentWorkspace } from "@/lib/create/platform/workspace";
import { assertSameOrigin } from "@/lib/security/origin";
import { blogsIn, createPost, deletePost, listPosts, seedBlogs, updatePost } from "@/lib/site-builder/features/blog";
import { getSite, headFiles } from "@/lib/site-builder/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Owner-only blog editor API. Visitors read published posts on the site; they can never write. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const ws = await currentWorkspace(req);
    const site = await getSite(ws, (await params).id);
    const files = await headFiles(site);
    await seedBlogs(site, files);
    const blogs = [];
    for (const b of blogsIn(files)) blogs.push({ key: b.key, title: b.title, posts: await listPosts(site, b.key) });
    return json({ blogs, published: site.publishedVersion !== null, slug: site.slug });
  } catch (e) {
    return errorResponse(e);
  }
}

async function owner(req: Request, params: Ctx["params"]) {
  assertSameOrigin(req);
  const ws = await currentWorkspace(req);
  assertSameAccount(req, ws.userId);
  await rateLimit(`sb:blog:${ws.id}`, 120, 60, { shared: true });
  const site = await getSite(ws, (await params).id);
  return { site, files: await headFiles(site) };
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { site, files } = await owner(req, params);
    const input = await body<{ key?: string; title?: unknown; body?: unknown; publish?: unknown }>(req);
    if (!input.key) throw new HttpError(400, "Which blog?");
    return json({ post: await createPost(site, files, input.key, input) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { site, files } = await owner(req, params);
    const input = await body<{ key?: string; id?: string; title?: unknown; body?: unknown; status?: unknown }>(req);
    if (!input.key || !input.id) throw new HttpError(400, "Which post?");
    return json({ post: await updatePost(site, files, input.key, input.id, input) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { site } = await owner(req, params);
    const input = await body<{ key?: string; id?: string }>(req);
    if (!input.key || !input.id) throw new HttpError(400, "Which post?");
    await deletePost(site, input.key, input.id);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
