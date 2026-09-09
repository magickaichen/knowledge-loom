import { spawnSync } from "node:child_process";
import { withVaultLock } from "../knowledge-loom/vault-lock.js";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { githubReleases, type ReleaseSource } from "./releases.js";
import { copyBundle, readAdvisories, type Advisory, fingerprint, SKILLS, validateBundle } from "./bundle.js";

export interface MaintenanceOptions {
  command: "bootstrap" | "status" | "use";
  home: string;
  source?: string;
  bootstrapRunner?: string;
  targets?: string[];
  loadedVersion?: string;
  pin?: string;
  lockWaitMs?: number;
}
interface InstallationLink { target: string; backup: string; route: "copy" | "symlink" | "skills-cli"; }
interface Recovery { attempts: number; retryAt: number; error: string; }
interface Pending { advisories: Advisory[]; bundle: string; installedVersion: string; installedRevision: string; fingerprints: Record<string, string>; lastCheck: number; }
interface State {
  checkRequested?: boolean;
  attempt?: number;
  advisories?: Advisory[];
  adopting?: boolean;
  pending?: Pending;
  recovery?: Recovery;
  schema: 1;
  installedRevision?: string;
  lastCheck?: number;
  pin?: string;
  links: InstallationLink[];
  installedVersion: string;
  bundle: string;
  fingerprints: Record<string, string>;
}
export interface MaintenanceResult {
  installations?: InstallationLink[];
  advisories?: Advisory[];
  restartRequired?: false;
  status: string;
  installedVersion: string;
  loadedVersion: string;
  entryPoint: string;
  installedRevision?: string;
  lastCheck?: number;
  recovery?: Recovery;
}
function save(file: string, value: unknown): void {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}
function installationRoute(target: string): InstallationLink["route"] {
  let directory = path.dirname(target);
  while (true) {
    for (const file of ["skills-lock.json", ".skill-lock.json"]) {
      const candidate = path.join(directory, file);
      if (!fs.existsSync(candidate)) continue;
      const metadata: unknown = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (metadata && typeof metadata === "object" && "skills" in metadata && metadata.skills && typeof metadata.skills === "object" && path.basename(target) in metadata.skills) return "skills-cli";
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return fs.lstatSync(target).isSymbolicLink() ? "symlink" : "copy";
}
function finishAdoption(root: string, state: State): void {
  const current = path.join(root, "current");
  if (!fs.lstatSync(current, { throwIfNoEntry: false })) fs.symlinkSync(state.bundle, current);
  else if (fs.realpathSync(current) !== state.bundle) throw new Error("unexpected bootstrap pointer");
  for (const link of state.links) {
    const expected = path.join(root, "current", "skills", path.basename(link.target));
    const existing = fs.lstatSync(link.target, { throwIfNoEntry: false });
    if (existing?.isSymbolicLink() && fs.readlinkSync(link.target) === expected) continue;
    if (existing) {
      if (fs.lstatSync(link.backup, { throwIfNoEntry: false }) || fingerprint(link.target) !== state.fingerprints[path.basename(link.target)]) throw new Error(`local modification during adoption: ${link.target}`);
      fs.mkdirSync(path.dirname(link.backup), { recursive: true });
      fs.renameSync(link.target, link.backup);
    } else if (!fs.lstatSync(link.backup, { throwIfNoEntry: false })) throw new Error(`missing adoption source: ${link.target}`);
    fs.symlinkSync(expected, link.target);
  }
  delete state.adopting;
}
export interface MaintenancePorts { releases?: ReleaseSource; now?: () => number; }
export async function maintain(options: MaintenanceOptions, ports: MaintenancePorts = {}): Promise<MaintenanceResult> {
  const root = path.join(fs.realpathSync(options.home), ".local", "share", "knowledge-loom");
  if (options.command !== "bootstrap" && !fs.existsSync(root)) return { status: "not-bootstrapped", installedVersion: "unknown", loadedVersion: options.loadedVersion ?? "unknown", entryPoint: path.join(root, "maintenance.cjs") };
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, "lock.git");
  if (!fs.existsSync(path.join(lock, "HEAD")) && spawnSync("git", ["init", "--bare", lock], { timeout: 10_000 }).status !== 0) throw new Error("cannot initialize installation lock");
  const acquired = await withVaultLock(lock, async () => maintainLocked(options, ports), options.lockWaitMs ?? 2_000);
  if (!acquired.acquired) return { status: "busy", installedVersion: "unknown", loadedVersion: options.loadedVersion ?? "unknown", entryPoint: path.join(root, "maintenance.cjs") };
  return acquired.value;
}
async function maintainLocked(options: MaintenanceOptions, ports: MaintenancePorts): Promise<MaintenanceResult> {
  const root = path.join(fs.realpathSync(options.home), ".local", "share", "knowledge-loom");
  const entryPoint = path.join(root, "maintenance.cjs");
  const stateFile = path.join(root, "state.json");
  const result = (status: string, version: string): MaintenanceResult => ({ status, installedVersion: version, loadedVersion: options.loadedVersion ?? "unknown", entryPoint });
  if (options.command === "bootstrap" && !fs.existsSync(stateFile)) {
    if (!options.source || !options.targets?.length) throw new Error("bootstrap requires source and targets");
    const version = validateBundle(options.source);
    const links: InstallationLink[] = [];
    for (const directory of options.targets) {
      for (const name of SKILLS) {
        const target = path.join(fs.realpathSync(directory), name);
        const canonical = fs.realpathSync(target);
        if (/[\\/](?:\.codex|\.claude)[\\/]plugins[\\/]/.test(canonical)) throw new Error(`plugin installation requires its owner to update: ${target}`);
        if (fingerprint(target) !== fingerprint(path.join(options.source, "skills", name))) throw new Error(`local modification collision: ${target}`);
        links.push({ target, backup: path.join(root, "backups", String(links.length), name), route: installationRoute(target) });

      }
    }
    fs.mkdirSync(root, { recursive: true });
    const bundle = path.join(root, "bundles", randomUUID());
    copyBundle(options.source, bundle);
    const runnerSource = options.bootstrapRunner ?? path.join(options.source, "dist", "maintenance.cjs");
    const temporaryRunner = `${entryPoint}.${randomUUID()}.tmp.cjs`;
    fs.copyFileSync(runnerSource, temporaryRunner);
    if (spawnSync(process.execPath, [temporaryRunner, "--help"], { timeout: 10_000 }).status !== 0) throw new Error("external entry point verification failed");
    fs.renameSync(temporaryRunner, entryPoint);
    const fingerprints = Object.fromEntries(SKILLS.map((name) => [name, fingerprint(path.join(bundle, "skills", name))]));
    const state: State = { schema: 1, adopting: true, links, installedVersion: version, bundle, fingerprints };
    save(stateFile, state);
    finishAdoption(root, state);
    save(stateFile, state);
    return { ...result("bootstrapped", version), installations: links };
  }
  if (!fs.existsSync(stateFile)) return result("not-bootstrapped", "unknown");
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8")) as State;
  let recovered = false;
  if (state.adopting) {
    finishAdoption(root, state);
    save(stateFile, state);
    recovered = true;
  }
  if (state.pending) {
    const current = fs.realpathSync(path.join(root, "current"));
    if (current === state.pending.bundle) {
      Object.assign(state, state.pending);
      delete state.recovery;
      delete state.checkRequested;
    } else if (current !== state.bundle) throw new Error("unrecognized current bundle; recovery requires inspection");
    delete state.pending;
    delete state.attempt;
    save(stateFile, state);
    recovered = true;
  }
  if (state.attempt !== undefined) {
    state.recovery = { attempts: 1, retryAt: (ports.now ?? Date.now)() + 60_000, error: "interrupted release check or staging; previous bundle retained" };
    delete state.attempt;
    save(stateFile, state);
    recovered = true;
  }
  const report = (status: string): MaintenanceResult => {
    const installed = state.pending && fs.realpathSync(path.join(root, "current")) === state.pending.bundle ? state.pending : state;
    return {
      ...result(status, installed.installedVersion),
      restartRequired: false,
      installations: state.links,
      advisories: (installed.advisories ?? []).filter((advisory) => advisory.affectedVersions.includes(installed.installedVersion) || (options.loadedVersion !== undefined && advisory.affectedVersions.includes(options.loadedVersion))),
      ...(installed.installedRevision ? { installedRevision: installed.installedRevision } : {}),
      ...(state.lastCheck !== undefined ? { lastCheck: state.lastCheck } : {}),
      ...(state.recovery ? { recovery: state.recovery } : {}),
    };
  };
  if (options.command === "status" || options.command === "bootstrap") return report(recovered ? "recovered" : "ready");
  const now = (ports.now ?? Date.now)();
  if (options.pin !== undefined && options.pin !== (state.pin ?? "none")) {
    if (!/^\d+\.\d+\.\d+$/.test(options.pin) && options.pin !== "none") throw new Error("pin must be a stable version or none");
    if (options.pin === "none") delete state.pin;
    else state.pin = options.pin;
    state.checkRequested = true;
    save(stateFile, state);
  }
  if (state.recovery && now < state.recovery.retryAt) return report("backoff");
  try {
  if (!state.checkRequested && state.lastCheck !== undefined && now - state.lastCheck < 604_800_000) return report("not-due");
  state.attempt = now;
  save(stateFile, state);
  const releases = ports.releases ?? githubReleases;
  const stable = (await releases.list()).filter((release) => release.published && !release.prerelease && /^\d+\.\d+\.\d+$/.test(release.version));
  const compare = (a: string, b: string): number => {
    const left = a.split(".").map(Number), right = b.split(".").map(Number);
    for (let index = 0; index < 3; index++) if (left[index] !== right[index]) return left[index]! - right[index]!;
    return 0;
  };
  let selected = state.pin ? stable.find((release) => release.version === state.pin) : stable.sort((a, b) => compare(b.version, a.version))[0];
  if (!selected) throw new Error("no matching published stable release");
  if (selected.version === state.installedVersion || (!state.pin && compare(selected.version, state.installedVersion) < 0)) {
    delete state.attempt;
    delete state.recovery;
    delete state.checkRequested;
    state.lastCheck = (ports.now ?? Date.now)();
    save(stateFile, state);
    return report("current");
  }
  if (releases.resolve) selected = await releases.resolve(selected);
  if (!/^[a-f0-9]{40}$/.test(selected.revision)) throw new Error("release must resolve to a specific revision");
  const staged = path.join(root, "bundles", randomUUID());
  fs.mkdirSync(staged, { recursive: true });
  await releases.stage(selected, staged);
  if (validateBundle(staged) !== selected.version) throw new Error("release version mismatch");
  for (const link of state.links) {
    const name = path.basename(link.target);
    if (!fs.lstatSync(link.target).isSymbolicLink() || fs.readlinkSync(link.target) !== path.join(root, "current", "skills", name) || fingerprint(link.target) !== state.fingerprints[name]) throw new Error(`local modification collision: ${link.target}`);
  }
  state.pending = { advisories: readAdvisories(staged), bundle: staged, installedVersion: selected.version, installedRevision: selected.revision, fingerprints: Object.fromEntries(SKILLS.map((name) => [name, fingerprint(path.join(staged, "skills", name))])), lastCheck: (ports.now ?? Date.now)() };
  save(stateFile, state);
  const pointer = path.join(root, `current.${randomUUID()}`);
  fs.symlinkSync(staged, pointer);
  fs.renameSync(pointer, path.join(root, "current"));
  Object.assign(state, state.pending);
  delete state.pending;
  delete state.attempt;
  delete state.recovery;
  delete state.checkRequested;
  state.lastCheck = (ports.now ?? Date.now)();
  save(stateFile, state);
  return report("updated");
  } catch (error) {
    delete state.attempt;
    const attempts = Math.min((state.recovery?.attempts ?? 0) + 1, 10);
    state.recovery = { attempts, retryAt: now + Math.min(60_000 * 2 ** (attempts - 1), 21_600_000), error: error instanceof Error ? error.message : String(error) };
    save(stateFile, state);
    return report("failed");
  }
}
