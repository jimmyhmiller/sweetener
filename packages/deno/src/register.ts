import module from "node:module";
import { createSweetenerHooks } from "./index.js";

/**
 * Preloaded with `deno run --import @sweetener/deno/register`, which installs
 * the hooks before the program it precedes is resolved.
 */
const registerHooks = (
  module as unknown as {
    registerHooks?: (hooks: unknown) => { deregister(): void };
  }
).registerHooks;

if (registerHooks === undefined)
  throw new Error(
    "This runtime has no module.registerHooks; Deno 2.x or a runtime implementing it is required. On Node, use @sweetener/node/register instead.",
  );

// A preload takes no arguments, so the one thing that has to be configurable
// — which config describes the project — is read from the environment.
const configFile = globalThis.process?.env?.["SWEETENER_CONFIG"];

registerHooks(
  createSweetenerHooks(configFile === undefined ? {} : { configFile }),
);
