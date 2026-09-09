import os from "node:os";
import { maintain, type MaintenanceOptions } from "./maintenance.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "--help") {
    console.log("maintenance bootstrap --source PATH --target PATH [--target PATH] [--home PATH]\nmaintenance status|use [--home PATH] [--loaded-version VERSION] [--pin VERSION|none]");
    return;
  }
  if (command !== "bootstrap" && command !== "status" && command !== "use") throw new Error("expected bootstrap, status, or use; see --help");
  const options: MaintenanceOptions = { command, home: os.homedir(), bootstrapRunner: process.argv[1]! };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(`missing value: ${flag}`);
    if (flag === "--home") options.home = value;
    else if (flag === "--source") options.source = value;
    else if (flag === "--target") (options.targets ??= []).push(value);
    else if (flag === "--pin") options.pin = value;
    else if (flag === "--loaded-version") options.loadedVersion = value;
    else throw new Error(`unknown option: ${flag}`);
  }
  const result = await maintain(options);
  console.log(JSON.stringify(result, null, 2));
  if (["failed", "backoff", "busy", "not-bootstrapped"].includes(result.status)) process.exitCode = 1;
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
