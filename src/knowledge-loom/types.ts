export type UnknownRecord = Record<string, unknown>;

export type FindingSeverity = "error" | "warning" | "info";

export interface Finding {
  severity: FindingSeverity;
  code: string;
  message: string;
  path: string | null;
  line?: number;
  source?: string;
  validationDate?: string;
}

export interface LoadedVault {
  root: string;
  contractPath: string;
  contract: UnknownRecord;
  body: string;
}

export const WRITE_POLICIES = ["explicit-only", "proactive-durable-capture"] as const;
export const CURRENT_STATE_POLICIES = ["explicit-only", "maintain-after-material-change"] as const;
export const HISTORY_TYPES = ["git", "none"] as const;

export type WritePolicy = typeof WRITE_POLICIES[number];
export type CurrentStatePolicy = typeof CURRENT_STATE_POLICIES[number];
export type HistoryType = typeof HISTORY_TYPES[number];

export function isWritePolicy(value: unknown): value is WritePolicy {
  return typeof value === "string" && WRITE_POLICIES.some((policy) => policy === value);
}

export function isCurrentStatePolicy(value: unknown): value is CurrentStatePolicy {
  return typeof value === "string" && CURRENT_STATE_POLICIES.some((policy) => policy === value);
}

export function isHistoryType(value: unknown): value is HistoryType {
  return typeof value === "string" && HISTORY_TYPES.some((type) => type === value);
}

export interface FocusView {
  path: string;
  subject: string;
  active_section?: string;
  max_active: number;
  max_top: number;
  require_start_here?: boolean;
}

export interface VaultContract extends UnknownRecord {
  schema_version: 1;
  vault_id: string;
  title: string;
  storage: {
    type: "local-markdown";
    link_style: "markdown";
  };
  subjects: {
    mode: "single" | "multiple";
    values: string[];
    default?: string;
  };
  write: {
    policy: WritePolicy;
    current_state_policy: CurrentStatePolicy;
  };
  history: {
    type: HistoryType;
    commit_policy: "after-authorized-write" | "none";
  };
  sync: { mode: "none" };
  backup: { mode: "none" };
  instruction_roots: string[];
  navigation: { entrypoints: string[] };
  metadata_profiles: UnknownRecord;
  focus_views: Record<string, FocusView>;
  privacy: { never_track: string[] };
}

export interface Registry extends UnknownRecord {
  schema_version: 1;
  vaults: UnknownRecord;
  projects?: UnknownRecord;
  content_check_adapters?: UnknownRecord;
}

export interface BuildContractOptions {
  vaultId: string;
  title: string;
  subjects: string[];
  writePolicy: WritePolicy;
  currentStatePolicy: CurrentStatePolicy;
  historyType: HistoryType;
  adopt: boolean;
}

export interface TextWriter {
  write(chunk: string): unknown;
}

export interface CliIo {
  cwd?: string | undefined;
  stdout?: TextWriter | undefined;
  stderr?: TextWriter | undefined;
}
