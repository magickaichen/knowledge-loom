import { execFileSync } from "node:child_process";

export function gitOutput(root: string, arguments_: string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...arguments_], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}
