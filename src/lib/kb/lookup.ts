import { allPosts } from "./blog";
import { allDocs } from "./docs";
import { allUseCases } from "./usecases";

/** Resolve an internal path to a known knowledge-base page (title + description) for "keep reading" lists. */
export function allBlogAndDocsByPath(path: string): { path: string; title: string; description: string } | undefined {
  return allPosts().find((x) => x.path === path) ?? allDocs().find((x) => x.path === path) ?? allUseCases().find((x) => x.path === path);
}
