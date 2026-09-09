import { build } from "esbuild";
await build({ entryPoints: ["src/maintenance/runner.ts"], outfile: "dist/maintenance.cjs", bundle: true, platform: "node", format: "cjs", target: "node20" });
