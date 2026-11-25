// Starts the API (port 3001) and the Vite dev server (port 5173) together.
import { spawn } from "node:child_process";

const start = (args) => spawn(process.execPath, args, { stdio: "inherit" });
const api = start(["--env-file-if-exists=.env.local", "server/dev-server.js"]);
const web = start(["node_modules/vite/bin/vite.js"]);

const stop = (code = 0) => {
  api.kill();
  web.kill();
  process.exit(code);
};
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
api.on("exit", (code) => code && stop(code));
web.on("exit", (code) => code && stop(code));
