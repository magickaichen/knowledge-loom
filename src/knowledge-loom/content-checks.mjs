import { spawnSync } from "node:child_process";

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
  };
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

  let resultRoot;
  try {
    resultRoot = canonicalPath(result.root);
  } catch {
    return invalid("content checker returned an unreadable root", "root");
  }
  if (resultRoot !== canonicalPath(vaultRoot)) {
    return invalid("content checker root does not match the selected vault", "root");
  }
  if (
    typeof result.validationDate !== "string"
    || !VALIDATION_DATE_RE.test(result.validationDate)
  ) {
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
      || (
        item.path !== null
        && item.path !== undefined
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

export function runDeclaredContentCheck(
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
  const completed = spawnSync(
    substitute(configuration.executable),
    configuration.arguments.map(substitute),
    {
      cwd: vault.root,
      encoding: "utf8",
      shell: false,
      timeout: timeoutMs,
      maxBuffer: ADAPTER_MAX_BUFFER,
    },
  );

  if (completed.error) {
    const reason = completed.error.code === "ETIMEDOUT"
      ? "timed out"
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
