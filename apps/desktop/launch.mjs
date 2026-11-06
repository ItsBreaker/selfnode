// Start Electron for development. Clears ELECTRON_RUN_AS_NODE, which some
// editors (e.g. VS Code) set for child processes and which would make Electron
// run as plain Node.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

const electron = createRequire(import.meta.url)("electron"); // the binary's path
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ["."], { stdio: "inherit", env }).on("exit", (code) => process.exit(code ?? 0));
