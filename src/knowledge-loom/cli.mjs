import path from "node:path";

import { auditVault } from "./audit.mjs";
import { validateContractData } from "./contract.mjs";
import { buildContract, initializeVault } from "./initializer.mjs";
import { expandHome } from "./pathing.mjs";
import { associateProject, registerVault, resolveApplicableVault, resolveVault } from "./registry.mjs";

const HELP = `usage: knowledge-loom {audit,probe,resolve,register,associate,init} ...

commands:
  audit       run a read-only vault audit
  probe       resolve only an ancestor or project-associated vault
  resolve     resolve one vault deterministically
  register    preview or register a vault
  associate   preview or associate a project with a registered vault
  init        preview or initialize a vault contract
`;

const COMMAND_HELP = {
  audit: "usage: knowledge-loom audit [selector] [--registry PATH] [--json]\n",
  probe: "usage: knowledge-loom probe [--registry PATH]\n",
  resolve: "usage: knowledge-loom resolve [selector] [--registry PATH]\n",
  register: "usage: knowledge-loom register vault_id path [--registry PATH] [--apply]\n",
  associate: "usage: knowledge-loom associate vault_id project_path [--registry PATH] [--replace] [--apply]\n",
  init: "usage: knowledge-loom init path --vault-id ID --title TITLE --subject SUBJECT [--subject SUBJECT ...] [--write-policy POLICY] [--current-state-policy POLICY] [--history TYPE] [--adopt] [--apply]\n",
};

function parseArguments(arguments_) {
  if (!arguments_.length) throw new Error(HELP.trim());
  if (arguments_.includes("-h") || arguments_[0] === "--help") return { help: true, command: arguments_[0] && !arguments_[0].startsWith("-") ? arguments_[0] : null };
  const command = arguments_[0];
  if (!Object.hasOwn(COMMAND_HELP, command)) throw new Error(`unknown command: ${command}`);
  if (arguments_.slice(1).includes("--help") || arguments_.slice(1).includes("-h")) return { help: true, command };

  const options = { command, positional: [], subject: [] };
  const flags = new Set(command === "audit"
    ? ["--json"]
    : command === "init"
      ? ["--adopt", "--apply"]
      : command === "register"
        ? ["--apply"]
        : command === "associate"
          ? ["--replace", "--apply"]
          : []);
  const valueOptions = new Set(["--registry"]);
  if (command === "init") {
    for (const name of ["--vault-id", "--title", "--subject", "--write-policy", "--current-state-policy", "--history"]) valueOptions.add(name);
  }
  for (let index = 1; index < arguments_.length; index += 1) {
    const token = arguments_[index];
    if (flags.has(token)) {
      options[token.slice(2).replaceAll("-", "_")] = true;
      continue;
    }
    const equals = token.startsWith("--") ? token.indexOf("=") : -1;
    const name = equals > 0 ? token.slice(0, equals) : token;
    if (valueOptions.has(name)) {
      const value = equals > 0 ? token.slice(equals + 1) : arguments_[++index];
      if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
      const key = name.slice(2).replaceAll("-", "_");
      if (key === "subject") options.subject.push(value);
      else options[key] = value;
      continue;
    }
    if (token.startsWith("-")) throw new Error(`unrecognized argument: ${token}`);
    options.positional.push(token);
  }
  return options;
}

export function formatFindings(findings, { json = false } = {}) {
  if (json) return `${JSON.stringify(findings, null, 2)}\n`;
  if (!findings.length) return "PASS no findings\n";
  return `${findings.map((item) => `${item.severity.toLocaleUpperCase().padEnd(7)} ${item.code}${item.path ? ` [${item.path}${item.line ? `:${item.line}` : ""}]` : ""}: ${item.message}`).join("\n")}\n`;
}

function requirePositionals(options, count, usage) {
  if (options.positional.length !== count) throw new Error(usage.trim());
}

export async function runCli(arguments_ = process.argv.slice(2), { cwd = process.cwd(), stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = parseArguments(arguments_);
    if (options.help) {
      stdout.write(options.command && COMMAND_HELP[options.command] ? COMMAND_HELP[options.command] : HELP);
      return 0;
    }

    if (options.command === "audit") {
      if (options.positional.length > 1) throw new Error(COMMAND_HELP.audit.trim());
      const vault = resolveVault(options.positional[0] ?? null, { cwd, registryPath: options.registry });
      const findings = await auditVault(vault, { registryPath: options.registry });
      stdout.write(formatFindings(findings, { json: options.json === true }));
      return findings.some((item) => item.severity === "error") ? 1 : 0;
    }
    if (options.command === "resolve") {
      if (options.positional.length > 1) throw new Error(COMMAND_HELP.resolve.trim());
      stdout.write(`${resolveVault(options.positional[0] ?? null, { cwd, registryPath: options.registry }).root}\n`);
      return 0;
    }
    if (options.command === "probe") {
      requirePositionals(options, 0, COMMAND_HELP.probe);
      const vault = resolveApplicableVault({ cwd, registryPath: options.registry });
      stdout.write(vault ? `${vault.root}\n` : "NO_APPLICABLE_VAULT\n");
      return 0;
    }
    if (options.command === "register") {
      requirePositionals(options, 2, COMMAND_HELP.register);
      const [registryPath, rendered] = registerVault(options.positional[0], options.positional[1], { registryPath: options.registry, apply: options.apply === true });
      if (options.apply) stdout.write(`registered ${options.positional[0]} in ${registryPath}\n`);
      else stdout.write(`DRY RUN would write ${registryPath}\n\n${rendered}`);
      return 0;
    }
    if (options.command === "associate") {
      requirePositionals(options, 2, COMMAND_HELP.associate);
      const [registryPath, rendered, projectRoot] = associateProject(options.positional[0], options.positional[1], {
        registryPath: options.registry,
        apply: options.apply === true,
        replace: options.replace === true,
      });
      if (options.apply) stdout.write(`associated ${projectRoot} with ${options.positional[0]} in ${registryPath}\n`);
      else stdout.write(`DRY RUN would associate ${projectRoot} with ${options.positional[0]} in ${registryPath}\n\n${rendered}`);
      return 0;
    }

    requirePositionals(options, 1, COMMAND_HELP.init);
    for (const required of ["vault_id", "title"]) if (!options[required]) throw new Error(`--${required.replaceAll("_", "-")} is required`);
    if (!options.subject.length) throw new Error("--subject is required");
    const writePolicy = options.write_policy ?? "proactive-durable-capture";
    const currentStatePolicy = options.current_state_policy ?? "maintain-after-material-change";
    const historyType = options.history ?? "none";
    if (!new Set(["explicit-only", "proactive-durable-capture"]).has(writePolicy)) throw new Error(`unsupported write policy: ${writePolicy}`);
    if (!new Set(["explicit-only", "maintain-after-material-change"]).has(currentStatePolicy)) throw new Error(`unsupported current-state policy: ${currentStatePolicy}`);
    if (!new Set(["git", "none"]).has(historyType)) throw new Error(`unsupported history type: ${historyType}`);
    const root = path.resolve(expandHome(options.positional[0]));
    const contract = buildContract(root, {
      vaultId: options.vault_id,
      title: options.title,
      subjects: options.subject,
      writePolicy,
      currentStatePolicy,
      historyType,
      adopt: options.adopt === true,
    });
    const findings = validateContractData(contract);
    if (findings.some((item) => item.severity === "error")) {
      stdout.write(formatFindings(findings));
      return 1;
    }
    const [contractPath, rendered] = initializeVault(root, { contract, adopt: options.adopt === true, apply: options.apply === true });
    if (options.apply) stdout.write(`created ${contractPath}\n`);
    else stdout.write(`DRY RUN would create ${contractPath}\n\n${rendered}`);
    return 0;
  } catch (error) {
    stderr.write(`ERROR ${error.message}\n`);
    return 2;
  }
}
