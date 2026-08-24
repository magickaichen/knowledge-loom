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

export type WritePolicy = "explicit-only" | "proactive-durable-capture";
export type CurrentStatePolicy = "explicit-only" | "maintain-after-material-change";
export type HistoryType = "git" | "none";

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
  focus_views: UnknownRecord;
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
