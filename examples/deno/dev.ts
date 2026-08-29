import { resolve } from "node:path";
import "./build.ts";

const here = import.meta.dirname!;
const watched = resolve(here, "../macro-suite");
let server: Deno.ChildProcess | undefined;

function restart(): void {
  server?.kill("SIGTERM");
  server = new Deno.Command(Deno.execPath(), {
    args: ["run", "--allow-net", resolve(here, "app.ts")],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
}

restart();
console.log("Watching Sweetener sources; Deno serves http://localhost:8000");

for await (const event of Deno.watchFs(watched)) {
  if (!event.paths.some((path) => /\.sts$/u.test(path))) continue;
  const build = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read=../..",
      "--allow-write=.sweetener",
      "--allow-env",
      resolve(here, "build.ts"),
    ],
  });
  const result = await build.output();
  if (result.success) restart();
  else await Deno.stderr.write(result.stderr);
}
