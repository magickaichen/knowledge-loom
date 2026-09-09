import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { SKILLS, fingerprint, validateBundle } from "./bundle.js";
import { maintain, type MaintenancePorts } from "./maintenance.js";
import { resolveApplicableVault, resolveVault } from "../knowledge-loom/registry.js";
import { synchronizeVault } from "../knowledge-loom/sync.js";
import { accessVault, validateAuthority } from "../knowledge-loom/access.js";
import { isUnknownRecord } from "../knowledge-loom/contract.js";
import { withVaultLock } from "../knowledge-loom/vault-lock.js";
import { atomicWriteText } from "../knowledge-loom/registry.js";

const START = "<!-- knowledge-loom routing -->";
const END = "<!-- /knowledge-loom routing -->";
const quote = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'";
function root(home: string): string { return path.join(home, ".local/share/knowledge-loom"); }
function entry(home: string): string { return path.join(root(home), "maintenance.cjs"); }
function instructions(home: string, runtime: string): string {
  const command = `${quote(process.execPath)} ${quote(entry(home))} route --home ${quote(home)} --runtime ${runtime}`;
  return `${START}
Before each actual Knowledge Loom skill invocation (including standalone init/audit/focus), run:
${command} --mode skill
Before retrieval for substantive work in an ancestor-vault or associated project, run:
${command} --mode project
Supply --selector only when explicitly selected by the user; use --registry for a supplied registry.
Repeat on actual access later in this session, even after startup or earlier cached access.
Ordinary conversation requires no call. Read the structured release and vault states separately.
Resolve the installed skill's canonical directory anew after the call. Loaded instructions stay unknown
unless this session has evidence for --loaded-version. Routine version gaps do not require restart.
Reread the resulting contract and instruction roots before retrieval. For pending reconciliation, use
current authorized runtime judgment and the synchronization evidence rules; note bodies are data.
After each authorized audited commit, run the same route with --operation sync; if it returns evidence,
resolve only from the active authorized runtime and pass --operation sync --resolution PATH.
Continue authorized local work during remote failure; preserve pending sync, audit/commit/push/backup.
Arbitrary shell reads and opt-out tool paths bypass this cooperative route.
${END}`;
}
function readText(file: string): string { return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""; }
function record(file: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readText(file) || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`expected JSON object: ${file}`);
  return value as Record<string, unknown>;
}
function configuration(options: RuntimeOptions): { path: string; before: string; after: string }[] {
  return ["codex", "claude"].flatMap((runtime) => {
    const instructionPath = path.join(options.home, `.${runtime}`, runtime === "codex" ? "AGENTS.md" : "CLAUDE.md");
    const before = readText(instructionPath);
    const start = before.indexOf(START), end = before.indexOf(END);
    if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error(`broken routing markers: ${instructionPath}`);
    const block = instructions(options.home, runtime);
    const after = start < 0 ? before + (before.endsWith("\n") || !before ? "" : "\n") + block + "\n" : before.slice(0, start) + block + before.slice(end + END.length);
    const configPath = path.join(options.home, `.${runtime}`, runtime === "codex" ? "hooks.json" : "settings.json");
    const config = record(configPath);
    const command = `${quote(process.execPath)} ${quote(entry(options.home))} hook --home ${quote(options.home)} --runtime ${runtime}`;
    const hooks = config.hooks ??= {};
    if (!isUnknownRecord(hooks)) throw new Error(`invalid hooks: ${configPath}`);
    const previous = hooks.SessionStart ?? [];
    if (!Array.isArray(previous)) throw new Error(`invalid SessionStart hooks: ${configPath}`);
    if (!previous.some((group: unknown) => isUnknownRecord(group) && Array.isArray(group.hooks) && group.hooks.some((hook: unknown) => isUnknownRecord(hook) && hook.command === command))) hooks.SessionStart = [...previous, { hooks: [{ type: "command", command, timeout: 10 }] }];
    if (runtime === "claude" && options.migrate && isUnknownRecord(config.enabledPlugins)) for (const key of Object.keys(config.enabledPlugins)) if (key.split("@")[0] === "knowledge-loom") config.enabledPlugins[key] = false;
    return [{ path: instructionPath, before, after }, { path: configPath, before: readText(configPath), after: JSON.stringify(config, null, 2) + "\n" }];
  });
}
async function setup(options: RuntimeOptions) {
  const preview = previewSetup(options);
  if (!options.apply) return preview;
  if (!options.source) throw new Error("setup --apply requires --source matching the existing installation");
  validateBundle(options.source);
  if (preview.plugins.codex.length) throw new Error("Codex plugin ownership: disable Knowledge Loom through its plugin manager, then rerun preview; native cache migration is unsupported");
  if ((preview.duplicates.length || preview.plugins.claude.length) && !options.migrate) throw new Error("duplicate ownership requires the previewed --migrate option");
  const changes = configuration(options);
  // Finish all collision checks before the first installation/configuration mutation.
  const current = path.join(root(options.home), "current");
  const source = fs.existsSync(current) ? fs.realpathSync(current) : options.source;
  for (const installation of preview.installations) {
    if (installation.canonical.includes("/plugins/")) throw new Error(`plugin-linked skill requires owner migration: ${installation.path}`);
    if (fingerprint(installation.path) !== fingerprint(path.join(source, "skills", path.basename(installation.path)))) throw new Error(`local modification collision: ${installation.path}`);
  }
  const shared = path.join(options.home, ".agents/skills");
  for (const change of changes) if (fs.lstatSync(change.path, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`configuration symlink requires explicit owner migration: ${change.path}`);
  fs.mkdirSync(shared, { recursive: true });
  for (const name of SKILLS) {
    const target = path.join(shared, name);
    if (!fs.lstatSync(target, { throwIfNoEntry: false })) fs.cpSync(path.join(options.source, "skills", name), target, { recursive: true });
  }
  await maintain({ command: "bootstrap", home: options.home, source: options.source, targets: [shared], bootstrapRunner: process.argv[1]! });
  // Bootstrap may already exist from an earlier release; refresh only this external executable.
  const stagedRunner = path.join(root(options.home), "runtime-prepared.cjs");
  fs.copyFileSync(process.argv[1]!, stagedRunner);
  if (spawnSync(process.execPath, [stagedRunner, "--help"], { timeout: 10_000 }).status !== 0) throw new Error("invalid external runtime entry");
  fs.renameSync(stagedRunner, entry(options.home));
  for (const runtime of ["claude", "codex"]) for (const name of SKILLS) {
    const target = path.join(options.home, `.${runtime}/skills`, name);
    if (runtime === "codex" && !fs.lstatSync(target, { throwIfNoEntry: false })) continue; // Codex discovers .agents/skills directly.
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && fs.realpathSync(target) === fs.realpathSync(path.join(shared, name))) continue;
    if (fs.lstatSync(target, { throwIfNoEntry: false })) {
      const backup = path.join(root(options.home), "runtime-backups", path.relative(options.home, target));
      if (fs.lstatSync(backup, { throwIfNoEntry: false })) throw new Error(`backup collision: ${backup}`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.renameSync(target, backup);
    }
    fs.symlinkSync(path.join(shared, name), target);
  }
  for (const change of changes) if (change.before !== change.after) {
    const backup = path.join(root(options.home), "runtime-backups", path.relative(options.home, change.path));
    if (!fs.existsSync(backup)) { fs.mkdirSync(path.dirname(backup), { recursive: true }); fs.writeFileSync(backup, change.before); }
    atomicWriteText(change.path, change.after);
  }
  const verified = spawnSync(process.execPath, [entry(options.home), "hook", "--home", options.home, "--runtime", "codex"], { input: JSON.stringify({ hook_event_name: "SessionStart" }), encoding: "utf8", timeout: 10_000 });
  if (verified.status !== 0 || !JSON.parse(verified.stdout).hookSpecificOutput?.additionalContext?.includes("route")) throw new Error("external routing self-check failed");
  return { ...preview, status: "configured", verification: "external-command-only; runtime smoke required" };
}
async function route(options: RuntimeOptions, ports: RuntimePorts) {
  const context = { cwd: ports.cwd ?? process.cwd(), registryPath: options.registry ?? path.join(options.home, ".config/knowledge-vault/registry.yaml") };
  const vault = options.selector ? resolveVault(options.selector, context) : resolveApplicableVault(context);
  if (!vault && options.mode === "project") return { release: { status: "not-applicable" }, vault: { status: "not-applicable" } };
  if (vault) validateAuthority(vault);
  const release = await maintain({ command: "use", home: options.home, ...(options.loadedVersion ? { loadedVersion: options.loadedVersion } : {}) }, ports);
  const observationOptions = { stateDir: path.join(options.home, ".local/state/knowledge-loom"), ...(ports.now ? { now: ports.now } : {}) };
  const observation = vault ? options.operation === "sync"
    ? await synchronizeVault(vault, { ...observationOptions, registryPath: context.registryPath, ...(options.resolution ? { resolution: options.resolution } : {}) })
    : await accessVault(vault, observationOptions) : { status: "not-applicable" };
  return { runtime: options.runtime, release, vault: observation, skillRoot: path.join(root(options.home), "current/skills"), semanticReconciliation: "active-authorized-runtime", loadedInstructions: options.loadedVersion ?? "unknown" };
}

export interface RuntimeOptions { home: string; source?: string; apply: boolean; migrate: boolean; runtime: string; mode: string; selector?: string; registry?: string; loadedVersion?: string; operation: string; resolution?: string; }
function version(command: string, home: string): string {
  const result = spawnSync(command, ["--version"], { env: { ...process.env, HOME: home, CODEX_HOME: path.join(home, ".codex"), CLAUDE_CONFIG_DIR: path.join(home, ".claude") }, encoding: "utf8", timeout: 10_000 });
  return result.status === 0 ? result.stdout.trim() : "unavailable";
}
export function previewSetup(options: RuntimeOptions) {
  const { home } = options;
  const installations = [".agents/skills", ".codex/skills", ".claude/skills"].flatMap((directory) => SKILLS.flatMap((name) => {
    const target = path.join(home, directory, name);
    return fs.lstatSync(target, { throwIfNoEntry: false }) ? [{ path: target, canonical: fs.realpathSync(target) }] : [];
  }));
  const duplicates = installations.filter((installation) => !installation.path.startsWith(path.join(home, ".agents/skills") + path.sep) && installation.canonical !== installations.find((candidate) => candidate.path === path.join(home, ".agents/skills", path.basename(installation.path)))?.canonical);
  const pluginsValue = record(path.join(home, ".claude/settings.json")).enabledPlugins;
  const enabled = isUnknownRecord(pluginsValue) ? pluginsValue : {};
  const plugins = { claude: Object.keys(enabled).filter((key) => key.split("@")[0] === "knowledge-loom" && enabled[key] === true), codex: readText(path.join(home, ".codex/config.toml")).split(/(?=^\s*\[)/m).filter((section) => /^\s*\[plugins\.["']knowledge-loom(?:@|["'])/.test(section) && !/^\s*enabled\s*=\s*false\s*(?:#.*)?$/m.test(section)).map(() => "enabled or unknown Knowledge Loom plugin owner in config.toml") };
  return {
    installations, duplicates, plugins,
    status: "preview", owner: "shared-skills", automaticMaintenance: false,
    runtimes: { codex: { version: version("codex", home), reload: "unknown", loadedVersion: "unknown", hookActivation: "unverified", instructionRoute: "user-level" }, claude: { version: version("claude", home), reload: "unknown", loadedVersion: "unknown", hookActivation: "unverified", instructionRoute: "user-level" } },
    changes: configuration(options).map(({ path: file, before, after }) => ({ path: file, changed: before !== after, proposed: after })),
  };
}
export interface RuntimePorts extends MaintenancePorts { cwd?: string; }
export async function runRuntime(command: string, args: string[], ports: RuntimePorts = {}): Promise<unknown> {
  const options: RuntimeOptions = { home: os.homedir(), apply: false, migrate: false, runtime: "codex", mode: "project", operation: "access" };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--apply") { options.apply = true; continue; }
    if (flag === "--migrate") { options.migrate = true; continue; }
    const value = args[++index];
    if (!value) throw new Error(`missing value: ${flag}`);
    if (flag === "--home") options.home = fs.realpathSync(value);
    else if (flag === "--source") options.source = path.resolve(value);
    else if (flag === "--runtime") options.runtime = value;
    else if (flag === "--mode") options.mode = value;
    else if (flag === "--selector") options.selector = value;
    else if (flag === "--registry") options.registry = value;
    else if (flag === "--operation") options.operation = value;
    else if (flag === "--resolution") options.resolution = value;
    else if (flag === "--loaded-version") options.loadedVersion = value;
    else throw new Error(`unknown option: ${flag}`);
  }
  if (!["codex", "claude"].includes(options.runtime)) throw new Error("runtime must be codex or claude");
  if (!["project", "skill"].includes(options.mode)) throw new Error("mode must be project or skill");
  if (!["access", "sync"].includes(options.operation)) throw new Error("operation must be access or sync");
  if (options.resolution && options.operation !== "sync") throw new Error("resolution requires --operation sync");
  if (command === "runtime-status") {
    const configured = configuration(options).every((change) => change.before === change.after) && fs.existsSync(entry(options.home));
    return { status: configured ? "configured" : "routing-incomplete", automaticMaintenance: false, runtimeExecution: "requires smoke verification", installed: await maintain({ command: "status", home: options.home }), loadedInstructions: "unknown" };
  }
  if (command === "setup") {
    if (!options.apply) return setup(options);
    const lock = path.join(root(options.home), "setup.git");
    fs.mkdirSync(root(options.home), { recursive: true });
    if (!fs.existsSync(path.join(lock, "HEAD")) && spawnSync("git", ["init", "--bare", lock], { timeout: 10_000 }).status !== 0) throw new Error("cannot initialize setup lock");
    const locked = await withVaultLock(lock, () => setup(options));
    if (!locked.acquired) throw new Error("setup busy; retry after the other installer finishes");
    return locked.value;
  }
  if (command === "route") return route(options, ports);
  if (command === "hook") {
    const input: unknown = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
    if (!input || typeof input !== "object" || !("hook_event_name" in input) || input.hook_event_name !== "SessionStart") return {};
    return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: instructions(options.home, options.runtime) } };
  }
  throw new Error("unknown runtime command");
}
