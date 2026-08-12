#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_CLI = process.env.KNOWLEDGE_LOOM_SKILLS_CLI ?? "skills@1.5.22";
const SKILL_NAMES = new Set(["audit-knowledge-vault", "init-knowledge-vault", "manage-current-focus", "use-knowledge-vault"]);
const RUNNER_CHECK_ROOTS = [path.join(".agents", "skills"), path.join(".claude", "skills")];
const INTERACTIVE_GROUP_PROMPT = "Select all 4 skills in Knowledge Loom.";

function commandPath(name) {
  const completed = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  return completed.status === 0 ? completed.stdout.split(/\r?\n/)[0].trim() : null;
}

function environment() {
  return Object.fromEntries(Object.entries({ ...process.env, DISABLE_TELEMETRY: "1" }).filter(([key]) => !key.startsWith("CODEX_")));
}

function run(command, arguments_, { cwd, capture = false } = {}) {
  const completed = spawnSync(command, arguments_, { cwd, env: environment(), encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (completed.status !== 0) throw new Error(`${[command, ...arguments_].join(" ")} exited with status ${completed.status}:\n${completed.stderr ?? ""}`);
  return completed.stdout ?? "";
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

async function assertInteractiveGroup(npx, workspace) {
  if (process.platform === "win32") throw new Error("interactive npx discovery test requires a POSIX pseudo-terminal");
  const command = [npx, "--yes", SKILLS_CLI, "add", PACKAGE_ROOT];
  let terminalCommand;
  let arguments_;
  let inputMode;
  const terminalEnvironment = environment();
  if (process.platform === "darwin") {
    terminalCommand = commandPath("expect");
    if (!terminalCommand) throw new Error("missing required command: expect");
    const program = [
      "set timeout 30",
      "spawn $env(KNOWLEDGE_LOOM_NPX) --yes $env(KNOWLEDGE_LOOM_SKILLS_SPEC) add $env(KNOWLEDGE_LOOM_PACKAGE_ROOT)",
      `expect { -exact {${INTERACTIVE_GROUP_PROMPT}} { exit 0 } timeout { exit 2 } eof { exit 3 } }`,
    ].join("\n");
    terminalEnvironment.KNOWLEDGE_LOOM_NPX = npx;
    terminalEnvironment.KNOWLEDGE_LOOM_SKILLS_SPEC = SKILLS_CLI;
    terminalEnvironment.KNOWLEDGE_LOOM_PACKAGE_ROOT = PACKAGE_ROOT;
    arguments_ = ["-c", program];
    inputMode = "ignore";
  } else {
    terminalCommand = commandPath("script");
    if (!terminalCommand) throw new Error("missing required command: script");
    arguments_ = ["-qefc", command.map(shellQuote).join(" "), "/dev/null"];
    inputMode = "pipe";
  }

  await new Promise((resolve, reject) => {
    const child = spawn(terminalCommand, arguments_, { cwd: workspace, env: terminalEnvironment, detached: true, stdio: [inputMode, "pipe", "pipe"] });
    let output = "";
    let found = false;
    let timeoutError = false;
    const stop = () => {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
    };
    const timer = setTimeout(() => { timeoutError = true; stop(); }, 30_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      if (!found && output.includes(INTERACTIVE_GROUP_PROMPT)) {
        found = true;
        stop();
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", () => {
      clearTimeout(timer);
      if (found) resolve();
      else reject(new Error(`bare npx installer omitted the Knowledge Loom all-skills group${timeoutError ? " before timeout" : ""}:\n${output}`));
    });
  });
}

function findInstalledRoots(workspace) {
  const roots = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules") continue;
      if (SKILL_NAMES.has(entry.name) && fs.statSync(path.join(candidate, "SKILL.md"), { throwIfNoEntry: false })?.isFile()) {
        const root = path.dirname(candidate);
        if (!roots.has(root)) roots.set(root, new Set());
        roots.get(root).add(entry.name);
      } else visit(candidate);
    }
  };
  visit(workspace);
  return roots;
}

export async function main() {
  const npx = commandPath("npx");
  if (!npx) throw new Error("missing required command: npx");
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-loom-npx-"));
  try {
    await assertInteractiveGroup(npx, workspace);
    const listing = run(npx, ["--yes", SKILLS_CLI, "add", PACKAGE_ROOT, "--list"], { cwd: workspace, capture: true });
    for (const skillName of SKILL_NAMES) if (!listing.includes(skillName)) throw new Error(`npx discovery omitted ${skillName}`);

    run(npx, ["--yes", SKILLS_CLI, "add", PACKAGE_ROOT, "--skill", "*", "--agent", "*", "--copy", "--yes"], { cwd: workspace });
    const installedRoots = findInstalledRoots(workspace);
    if (installedRoots.size <= RUNNER_CHECK_ROOTS.length) throw new Error("npx all-agent installation did not create additional agent install roots");
    for (const [installedRoot, skillNames] of installedRoots) {
      if (skillNames.size !== SKILL_NAMES.size || [...SKILL_NAMES].some((name) => !skillNames.has(name))) {
        throw new Error(`incomplete all-agent installation at ${installedRoot}: ${[...skillNames].sort().join(", ")}`);
      }
    }

    for (const relativeRoot of RUNNER_CHECK_ROOTS) {
      for (const skillName of SKILL_NAMES) {
        const runner = path.join(workspace, relativeRoot, skillName, "scripts", "knowledge-loom.mjs");
        run(process.execPath, [runner, "audit", path.join(PACKAGE_ROOT, "tests", "fixtures", "single-proactive")], { cwd: workspace });
      }
    }
    const installed = JSON.parse(run(npx, ["--yes", SKILLS_CLI, "list", "--json"], { cwd: workspace, capture: true }));
    const names = new Set(installed.map((record) => record.name));
    if (names.size !== SKILL_NAMES.size || [...SKILL_NAMES].some((name) => !names.has(name))) throw new Error(`installed skill mismatch: ${[...names].sort().join(", ")}`);
    console.log(`PASS npx ${SKILLS_CLI} offered one interactive Knowledge Loom group and installed all four skills for every supported agent across ${installedRoots.size} distinct roots; Codex and Claude Code runners passed`);
    return 0;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().then((status) => { process.exitCode = status; }).catch((error) => { console.error(`ERROR ${error.message}`); process.exitCode = 1; });
}
