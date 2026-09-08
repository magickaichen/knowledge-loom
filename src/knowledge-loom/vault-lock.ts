import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import { setTimeout } from "node:timers/promises";

import { isUnknownRecord } from "./contract.js";
import type { TextWriter } from "./types.js";

const LOCK_REF = "refs/knowledge-loom/mutation-lock";

function command(root: string, args: string[], input?: string) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8", input, timeout: 10_000 });
}

function deadOwner(root: string, revision: string): boolean {
  try {
    const result = command(root, ["cat-file", "blob", revision]);
    const owner: unknown = JSON.parse(result.stdout);
    if (!isUnknownRecord(owner) || owner.host !== os.hostname() || typeof owner.pid !== "number" || !Number.isInteger(owner.pid) || owner.pid < 1) return false;
    const pids = [owner.pid];
    if (owner.writer_pid !== undefined) {
      if (typeof owner.writer_pid !== "number" || !Number.isInteger(owner.writer_pid) || owner.writer_pid < 1) return false;
      pids.push(owner.writer_group === true ? -owner.writer_pid : owner.writer_pid);
    }
    return pids.every((pid) => {
      try { process.kill(pid, 0); return false; } catch (error) { return isUnknownRecord(error) && error.code === "ESRCH"; }
    });
  } catch { /* An unrecognized owner is preserved for explicit recovery. */ }
  return false;
}

/** Git's compare-and-swap reference update serializes all cooperating worktrees.
 * Dead-owner recovery and release compare the exact owner object, so neither
 * can accidentally remove a successor's lock. Live owners never expire by age.
 */
type TrackWriter = (pid: number, group?: boolean) => void;

export async function withVaultLock<T>(root: string, work: (trackWriter: TrackWriter) => Promise<T>, waitMs = 2_000): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const owner = { schema_version: 1, host: os.hostname(), pid: process.pid, token: randomUUID() };
  const hashed = command(root, ["hash-object", "-w", "--stdin"], JSON.stringify(owner));
  if (hashed.status !== 0) throw new Error("cannot create vault mutation lock");
  let revision = hashed.stdout.trim();
  const deadline = performance.now() + waitMs;
  do {
    const existing = command(root, ["rev-parse", "--verify", "--quiet", LOCK_REF]);
    const current = existing.status === 0 ? existing.stdout.trim() : "0".repeat(revision.length);
    if (existing.status !== 0 || deadOwner(root, current)) {
      const acquired = command(root, ["-c", `core.hooksPath=${os.devNull}`, "update-ref", LOCK_REF, revision, current]);
      if (acquired.status === 0) {
        try {
          return { acquired: true, value: await work((pid, group = false) => {
            const updated = command(root, ["hash-object", "-w", "--stdin"], JSON.stringify({ ...owner, writer_pid: pid, writer_group: group }));
            const next = updated.stdout.trim();
            if (updated.status !== 0 || command(root, ["-c", `core.hooksPath=${os.devNull}`, "update-ref", LOCK_REF, next, revision]).status !== 0) throw new Error("cannot track the active writer");
            revision = next;
          }) };
        }
        finally {
          const released = command(root, ["-c", `core.hooksPath=${os.devNull}`, "update-ref", "-d", LOCK_REF, revision]);
          if (released.status !== 0) throw new Error("vault mutation lock release failed; inspect lock ownership before retrying");
        }
      }
    }
    if (performance.now() >= deadline) break;
    await setTimeout(25);
  } while (true);
  return { acquired: false };
}

/** Keep child lifetime inside ownership, including failed PID registration. */
export function runLockedProcess(root: string, executable: string, args: string[], trackWriter: TrackWriter, {
  stdout, stderr, timeoutMs, env = process.env,
}: { stdout?: TextWriter; stderr?: TextWriter; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const group = process.platform !== "win32";
    const child = spawn(executable, args, { cwd: root, env, detached: group, stdio: ["ignore", "pipe", "pipe"] });
    let failure: unknown;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
    const stop = () => {
      try { if (child.pid) process.kill(group ? -child.pid : child.pid, "SIGKILL"); } catch { /* Already exited. */ }
    };
    child.stdout.on("data", (data: Buffer) => stdout?.write(data.toString()));
    child.stderr.on("data", (data: Buffer) => stderr?.write(data.toString()));
    child.on("error", (error) => { failure = error; });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else resolve(code ?? 1);
    });
    try { if (child.pid) trackWriter(child.pid, group); }
    catch (error) { failure = error; stop(); }
    if (timeoutMs !== undefined) timer = globalThis.setTimeout(() => { failure = new Error("locked command timed out"); stop(); }, timeoutMs);
  });
}
