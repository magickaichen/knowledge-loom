import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { SKILLS } from "./bundle.js";

export interface Release { version: string; revision: string; published: boolean; prerelease: boolean; }
export interface ReleaseSource {
  list(): Promise<Release[]>;
  resolve?(release: Release): Promise<Release>;
  stage(release: Release, destination: string): Promise<void>;
}
const REPOSITORY = "magickaichen/knowledge-loom";
async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`release request failed: HTTP ${response.status}`);
  if (!response.body) throw new Error("empty release response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32 * 1024 * 1024) throw new Error("release response exceeds 32 MiB");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function json(endpoint: string): Promise<unknown> {
  return JSON.parse(Buffer.from(await download(`https://api.github.com/repos/${REPOSITORY}/${endpoint}`)).toString("utf8"));
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid release response");
  return value as Record<string, unknown>;
}
export const githubReleases: ReleaseSource = {
  async list() {
    const releases: Release[] = [];
    for (let page = 1; page <= 10; page++) {
      const data = await json(`releases?per_page=100&page=${page}`);
      if (!Array.isArray(data)) throw new Error("invalid release listing");
      for (const item of data) {
        const release = record(item);
        if (typeof release.tag_name !== "string" || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) continue;
        releases.push({ version: release.tag_name.slice(1), revision: "", published: release.draft === false && typeof release.published_at === "string", prerelease: release.prerelease !== false });
      }
      if (data.length < 100) return releases;
    }
    throw new Error("release listing exceeds pagination limit");
  },
  async resolve(release) {
    let reference = record(await json(`git/ref/tags/v${release.version}`));
    for (let depth = 0; depth < 8; depth++) {
      const object = record(reference.object);
      if (typeof object.sha !== "string" || !/^[a-f0-9]{40}$/.test(object.sha)) throw new Error("invalid release revision");
      if (object.type === "commit") return { ...release, revision: object.sha };
      if (object.type !== "tag") throw new Error("release tag does not point to a commit");
      reference = record(await json(`git/tags/${object.sha}`));
    }
    throw new Error("release tag nesting exceeds limit");
  },
  async stage(release, destination) {
    if (!/^[a-f0-9]{40}$/.test(release.revision)) throw new Error("release must resolve to a specific revision");
    const prefix = `knowledge-loom-${release.revision}/`;
    let expanded = 0;
    const files = unzipSync(await download(`https://codeload.github.com/${REPOSITORY}/zip/${release.revision}`), {
      filter(file) {
        if (!file.name.startsWith(prefix)) return false;
        const relative = file.name.slice(prefix.length);
        const allowed = relative === "package.json" || relative === "data-integrity-advisories.json" || SKILLS.some((name) => relative.startsWith(`skills/${name}/`));
        if (!allowed || file.name.endsWith("/")) return false;
        if (relative.split("/").some((part) => part === ".." || part === "." || part.includes("\\"))) throw new Error("unsafe release path");
        expanded += file.originalSize;
        if (expanded > 64 * 1024 * 1024) throw new Error("expanded release exceeds 64 MiB");
        return true;
      },
    });
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(destination, name.slice(prefix.length));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
      if (target.endsWith("/scripts/knowledge-loom.mjs")) fs.chmodSync(target, 0o755);
    }
  },
};
