import { randomBytes } from "node:crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function slugify(s: string, max = 40): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/g, "") || "project"
  );
}
