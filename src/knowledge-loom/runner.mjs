#!/usr/bin/env node
import { runCli } from "./cli.mjs";

process.exitCode = await runCli();
