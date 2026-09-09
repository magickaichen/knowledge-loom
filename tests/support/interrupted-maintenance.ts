import { maintain } from "../../src/maintenance/maintenance.ts";
await maintain({ command: "use", home: process.argv[2]! }, { releases: {
  async list() { return [{ version: "0.9.0", revision: "a".repeat(40), published: true, prerelease: false }]; },
  async stage() {
    process.stdout.write("STAGING\n");
    await new Promise(() => { setInterval(() => {}, 1000); });
  },
} });
