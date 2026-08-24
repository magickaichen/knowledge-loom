import { spawn } from "node:child_process";
import path from "node:path";
import type { ChildProcess, ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

import { finding, isUnknownRecord, KEBAB_CASE_ID_RE } from "./contract.js";
import { errorMessage } from "./errors.js";
import { canonicalPath, isVaultRelativePath, resolveVaultPath } from "./pathing.js";
import { loadRegistry } from "./registry.js";
import type { Finding, FindingSeverity, LoadedVault, Registry } from "./types.js";

const VALIDATION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SEVERITIES = new Set<FindingSeverity>(["error", "warning", "info"]);
const STATUS_EXIT_CODES = { pass: 0, fail: 1, error: 2 } as const;
const ADAPTER_TIMEOUT_MS = 30_000;
const ADAPTER_MAX_BUFFER = 1024 * 1024;

type ContentCheckStatus = keyof typeof STATUS_EXIT_CODES;

interface AdapterConfiguration {
  executable: string;
  arguments: string[];
}

interface CodedError extends Error {
  code?: string;
}

type AdapterExecution =
  | { ok: false; error: CodedError }
  | { ok: true; stdout: string; status: number | null; signal: NodeJS.Signals | null };

type NormalizedResult =
  | { ok: false; error: Finding }
  | { ok: true; status: ContentCheckStatus; validationDate: string; findings: Finding[] };

function asCodedError(error: unknown): CodedError {
  return error instanceof Error ? error : new Error(String(error));
}

function adapterFinding(adapterId: string, code: string, message: string, findingPath: string | null = null): Finding {
  return {
    ...finding("error", `content-check.${code}`, message, findingPath),
    source: adapterId ? `content-check:${adapterId}` : "content-check",
  };
}

function passedFinding(adapterId: string, validationDate: string): Finding {
  return {
    severity: "info",
    code: `content-check.${adapterId}.passed`,
    message: `content check passed (${validationDate})`,
    path: null,
    source: `content-check:${adapterId}`,
    validationDate,
  };
}

function validValidationDate(value: unknown): value is string {
  if (typeof value !== "string" || !VALIDATION_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function adapterConfiguration(registry: Registry, adapterId: string): unknown {
  const adapters = registry.content_check_adapters;
  if (!adapters || typeof adapters !== "object" || Array.isArray(adapters)) return null;
  return adapters[adapterId] ?? null;
}

function parseConfiguration(
  adapterId: string,
  configuration: unknown,
): { ok: false; error: Finding } | { ok: true; value: AdapterConfiguration } {
  if (!configuration) {
    return { ok: false, error: adapterFinding(
      adapterId,
      "adapter-missing",
      `content check adapter \`${adapterId}\` is not configured in the local registry`,
    ) };
  }
  if (!isUnknownRecord(configuration)) {
    return { ok: false, error: adapterFinding(
      adapterId,
      "adapter-config",
      `content check adapter \`${adapterId}\` must be a mapping`,
    ) };
  }
  if (typeof configuration.executable !== "string" || !configuration.executable.trim()) {
    return { ok: false, error: adapterFinding(
      adapterId,
      "adapter-config",
      `content check adapter \`${adapterId}\` requires a non-empty \`executable\``,
    ) };
  }
  if (
    !Array.isArray(configuration.arguments)
    || configuration.arguments.some((value) => typeof value !== "string")
  ) {
    return { ok: false, error: adapterFinding(
      adapterId,
      "adapter-config",
      `content check adapter \`${adapterId}\` requires a string \`arguments\` list`,
    ) };
  }
  const arguments_ = configuration.arguments.filter((value): value is string => typeof value === "string");
  for (const value of [configuration.executable, ...arguments_]) {
    const placeholders = value.match(/\{[^}]+\}/g) ?? [];
    if (placeholders.some((placeholder) => placeholder !== "{vault_root}")) {
      return { ok: false, error: adapterFinding(
        adapterId,
        "adapter-config",
        `content check adapter \`${adapterId}\` uses an unsupported placeholder`,
      ) };
    }
  }
  return { ok: true, value: { executable: configuration.executable, arguments: arguments_ } };
}

function isContentCheckStatus(value: unknown): value is ContentCheckStatus {
  return typeof value === "string" && Object.hasOwn(STATUS_EXIT_CODES, value);
}

function isFindingSeverity(value: unknown): value is FindingSeverity {
  return typeof value === "string" && ALLOWED_SEVERITIES.has(value as FindingSeverity);
}

function normalizedResult(adapterId: string, result: unknown, vaultRoot: string): NormalizedResult {
  const invalid = (message: string, code = "output"): NormalizedResult => ({
    ok: false,
    error: adapterFinding(adapterId, code, message),
  });
  if (!isUnknownRecord(result)) {
    return invalid("content checker output must be a JSON object");
  }
  if (!isContentCheckStatus(result.status)) {
    return invalid("content checker returned an unsupported status");
  }
  if (typeof result.root !== "string") {
    return invalid("content checker output requires `root`");
  }

  if (!path.isAbsolute(result.root) || result.root !== canonicalPath(vaultRoot)) {
    return invalid("content checker root does not match the selected vault", "root");
  }
  if (!validValidationDate(result.validationDate)) {
    return invalid("content checker output requires `validationDate` in YYYY-MM-DD form");
  }
  if (!Array.isArray(result.findings)) {
    return invalid("content checker output requires a `findings` list");
  }

  const findings: Finding[] = [];
  for (const item of result.findings) {
    if (
      !isUnknownRecord(item)
      || !isFindingSeverity(item.severity)
      || typeof item.code !== "string"
      || !item.code.trim()
      || typeof item.message !== "string"
      || !item.message.trim()
      || !Object.hasOwn(item, "path")
      || (
        item.path !== null
        && (
          typeof item.path !== "string"
          || !isVaultRelativePath(item.path)
          || !resolveVaultPath(vaultRoot, item.path)
        )
      )
      || (item.line !== undefined && (typeof item.line !== "number" || !Number.isInteger(item.line) || item.line < 1))
    ) {
      return invalid("content checker returned an invalid finding");
    }
    const normalizedPath = item.path === null ? null : item.path;
    const normalized: Finding = {
      severity: item.severity,
      code: `content-check.${adapterId}.${item.code}`,
      message: item.message,
      path: normalizedPath,
      source: `content-check:${adapterId}`,
      validationDate: result.validationDate,
    };
    if (typeof item.line === "number") normalized.line = item.line;
    findings.push(normalized);
  }

  const hasError = findings.some((item) => item.severity === "error");
  if ((result.status === "pass" && hasError) || (result.status !== "pass" && !hasError)) {
    return invalid("content checker status is inconsistent with its findings");
  }
  return { ok: true, status: result.status, validationDate: result.validationDate, findings };
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => {
      try { child.kill("SIGKILL"); } catch { /* The process already exited. */ }
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    try { child.kill("SIGKILL"); } catch { /* The process already exited. */ }
  }
}

function executeAdapter(
  executable: string,
  arguments_: string[],
  { cwd, timeoutMs }: { cwd: string; timeoutMs: number },
): Promise<AdapterExecution> {
  return new Promise((resolve) => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(executable, arguments_, {
        cwd,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({ ok: false, error: asCodedError(error) });
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stdout = "";
    let outputBytes = 0;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const finish = (result: AdapterExecution): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    };
    const terminate = (error: CodedError): void => {
      killProcessTree(child);
      child.stdout.destroy();
      child.stderr.destroy();
      finish({ ok: false, error });
    };
    const collect = (chunk: string, { capture = false }: { capture?: boolean } = {}): void => {
      outputBytes += Buffer.byteLength(chunk, "utf8");
      if (outputBytes > ADAPTER_MAX_BUFFER) {
        const error: CodedError = new Error("output exceeded the 1 MiB limit");
        error.code = "ENOBUFS";
        terminate(error);
        return;
      }
      if (capture) stdout += chunk;
    };

    child.once("error", (error) => finish({ ok: false, error: asCodedError(error) }));
    child.stdout.on("data", (chunk) => collect(chunk, { capture: true }));
    child.stderr.on("data", (chunk) => collect(chunk));
    child.once("close", (status, signal) => finish({ ok: true, stdout, status, signal }));
    timer = setTimeout(() => {
      const error: CodedError = new Error("timed out");
      error.code = "ETIMEDOUT";
      terminate(error);
    }, timeoutMs);
  });
}

export async function runDeclaredContentCheck(
  vault: LoadedVault,
  {
    registryPath,
    timeoutMs = ADAPTER_TIMEOUT_MS,
  }: { registryPath?: string | undefined; timeoutMs?: number } = {},
): Promise<Finding[]> {
  const contentChecks = isUnknownRecord(vault.contract.content_checks) ? vault.contract.content_checks : {};
  const adapterId = contentChecks.adapter;
  if (typeof adapterId !== "string" || !KEBAB_CASE_ID_RE.test(adapterId)) return [];

  let registry;
  try {
    registry = loadRegistry(registryPath);
  } catch (error) {
    return [
      adapterFinding(
        adapterId,
        "registry",
        `cannot load the local adapter registry: ${errorMessage(error)}`,
      ),
    ];
  }

  const parsedConfiguration = parseConfiguration(adapterId, adapterConfiguration(registry, adapterId));
  if (!parsedConfiguration.ok) return [parsedConfiguration.error];
  const configuration = parsedConfiguration.value;

  const substitute = (value: string): string => value.replaceAll("{vault_root}", vault.root);
  const completed = await executeAdapter(
    substitute(configuration.executable),
    configuration.arguments.map(substitute),
    {
      cwd: vault.root,
      timeoutMs,
    },
  );

  if (!completed.ok) {
    const reason = completed.error.code === "ETIMEDOUT"
      ? "timed out"
      : completed.error.code === "ENOBUFS"
        ? "exceeded the 1 MiB output limit"
        : `could not start: ${completed.error.message}`;
    return [
      adapterFinding(
        adapterId,
        "execution",
        `content check adapter \`${adapterId}\` ${reason}`,
      ),
    ];
  }
  if (completed.signal) {
    return [
      adapterFinding(
        adapterId,
        "execution",
        `content check adapter \`${adapterId}\` ended with signal ${completed.signal}`,
      ),
    ];
  }

  let result: unknown;
  try {
    result = JSON.parse(completed.stdout);
  } catch {
    return [
      adapterFinding(
        adapterId,
        "output",
        `content check adapter \`${adapterId}\` did not return valid JSON`,
      ),
    ];
  }

  const normalized = normalizedResult(adapterId, result, vault.root);
  if (!normalized.ok) return [normalized.error];
  if (completed.status !== STATUS_EXIT_CODES[normalized.status]) {
    return [
      adapterFinding(
        adapterId,
        "exit-status",
        `content check adapter \`${adapterId}\` exit status does not match its result`,
      ),
    ];
  }
  return normalized.status === "pass"
    ? [passedFinding(adapterId, normalized.validationDate), ...normalized.findings]
    : normalized.findings;
}
