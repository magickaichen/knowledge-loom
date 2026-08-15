import { spawn } from "node:child_process";
import path from "node:path";

import { finding, KEBAB_CASE_ID_RE } from "./contract.mjs";
import { canonicalPath, isVaultRelativePath, resolveVaultPath } from "./pathing.mjs";
import { loadRegistry } from "./registry.mjs";

const VALIDATION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SEVERITIES = new Set(["error", "warning", "info"]);
const STATUS_EXIT_CODES = { pass: 0, fail: 1, error: 2 };
const ADAPTER_TIMEOUT_MS = 30_000;
const ADAPTER_MAX_BUFFER = 1024 * 1024;

function adapterFinding(adapterId, code, message, findingPath = null) {
  return {
    ...finding("error", `content-check.${code}`, message, findingPath),
    source: adapterId ? `content-check:${adapterId}` : "content-check",
  };
}

function passedFinding(adapterId, validationDate) {
  return {
    severity: "info",
    code: `content-check.${adapterId}.passed`,
    message: `content check passed (${validationDate})`,
    path: null,
    source: `content-check:${adapterId}`,
    validationDate,
  };
}

function validValidationDate(value) {
  if (typeof value !== "string" || !VALIDATION_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function adapterConfiguration(registry, adapterId) {
  const adapters = registry.content_check_adapters;
  if (!adapters || typeof adapters !== "object" || Array.isArray(adapters)) return null;
  return adapters[adapterId] ?? null;
}

function configurationError(adapterId, configuration) {
  if (!configuration) {
    return adapterFinding(
      adapterId,
      "adapter-missing",
      `content check adapter \`${adapterId}\` is not configured in the local registry`,
    );
  }
  if (typeof configuration !== "object" || Array.isArray(configuration)) {
    return adapterFinding(
      adapterId,
      "adapter-config",
      `content check adapter \`${adapterId}\` must be a mapping`,
    );
  }
  if (typeof configuration.executable !== "string" || !configuration.executable.trim()) {
    return adapterFinding(
      adapterId,
      "adapter-config",
      `content check adapter \`${adapterId}\` requires a non-empty \`executable\``,
    );
  }
  if (
    !Array.isArray(configuration.arguments)
    || configuration.arguments.some((value) => typeof value !== "string")
  ) {
    return adapterFinding(
      adapterId,
      "adapter-config",
      `content check adapter \`${adapterId}\` requires a string \`arguments\` list`,
    );
  }
  for (const value of [configuration.executable, ...configuration.arguments]) {
    const placeholders = value.match(/\{[^}]+\}/g) ?? [];
    if (placeholders.some((placeholder) => placeholder !== "{vault_root}")) {
      return adapterFinding(
        adapterId,
        "adapter-config",
        `content check adapter \`${adapterId}\` uses an unsupported placeholder`,
      );
    }
  }
  return null;
}

function normalizedResult(adapterId, result, vaultRoot) {
  const invalid = (message, code = "output") => ({
    error: adapterFinding(adapterId, code, message),
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return invalid("content checker output must be a JSON object");
  }
  if (!Object.hasOwn(STATUS_EXIT_CODES, result.status)) {
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

  const findings = [];
  for (const item of result.findings) {
    if (
      !item
      || typeof item !== "object"
      || Array.isArray(item)
      || !ALLOWED_SEVERITIES.has(item.severity)
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
      || (item.line !== undefined && (!Number.isInteger(item.line) || item.line < 1))
    ) {
      return invalid("content checker returned an invalid finding");
    }
    const normalized = {
      severity: item.severity,
      code: `content-check.${adapterId}.${item.code}`,
      message: item.message,
      path: item.path ?? null,
      source: `content-check:${adapterId}`,
      validationDate: result.validationDate,
    };
    if (item.line !== undefined) normalized.line = item.line;
    findings.push(normalized);
  }

  const hasError = findings.some((item) => item.severity === "error");
  if ((result.status === "pass" && hasError) || (result.status !== "pass" && !hasError)) {
    return invalid("content checker status is inconsistent with its findings");
  }
  return { status: result.status, validationDate: result.validationDate, findings };
}

function killProcessTree(child) {
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

function executeAdapter(executable, arguments_, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, arguments_, {
        cwd,
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({ error });
      return;
    }

    let settled = false;
    let timer;
    let stdout = "";
    let outputBytes = 0;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const terminate = (error) => {
      killProcessTree(child);
      child.stdout.destroy();
      child.stderr.destroy();
      finish({ error });
    };
    const collect = (chunk, { capture = false } = {}) => {
      outputBytes += Buffer.byteLength(chunk, "utf8");
      if (outputBytes > ADAPTER_MAX_BUFFER) {
        const error = new Error("output exceeded the 1 MiB limit");
        error.code = "ENOBUFS";
        terminate(error);
        return;
      }
      if (capture) stdout += chunk;
    };

    child.once("error", (error) => finish({ error }));
    child.stdout.on("data", (chunk) => collect(chunk, { capture: true }));
    child.stderr.on("data", (chunk) => collect(chunk));
    child.once("close", (status, signal) => finish({ stdout, status, signal }));
    timer = setTimeout(() => {
      const error = new Error("timed out");
      error.code = "ETIMEDOUT";
      terminate(error);
    }, timeoutMs);
  });
}

export async function runDeclaredContentCheck(
  vault,
  {
    registryPath,
    timeoutMs = ADAPTER_TIMEOUT_MS,
  } = {},
) {
  const adapterId = vault.contract.content_checks?.adapter;
  if (!adapterId || !KEBAB_CASE_ID_RE.test(adapterId)) return [];

  let registry;
  try {
    registry = loadRegistry(registryPath);
  } catch (error) {
    return [
      adapterFinding(
        adapterId,
        "registry",
        `cannot load the local adapter registry: ${error.message}`,
      ),
    ];
  }

  const configuration = adapterConfiguration(registry, adapterId);
  const invalidConfiguration = configurationError(adapterId, configuration);
  if (invalidConfiguration) return [invalidConfiguration];

  const substitute = (value) => value.replaceAll("{vault_root}", vault.root);
  const completed = await executeAdapter(
    substitute(configuration.executable),
    configuration.arguments.map(substitute),
    {
      cwd: vault.root,
      timeoutMs,
    },
  );

  if (completed.error) {
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

  let result;
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
  if (normalized.error) return [normalized.error];
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
