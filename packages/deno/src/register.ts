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

// Node implements registerHooks too, so it would install these happily and
// then behave differently: delegating a CommonJS load through a hook returns
// no source on Node 24, and every require after this would fail. Refusing is
// better than half-working, and Node has its own entry point.
if ((globalThis as { Deno?: unknown }).Deno === undefined)
  throw new Error(
    "@sweetener/deno/register is for Deno. On Node, use @sweetener/node/register instead.",
  );

if (registerHooks === undefined)
  throw new Error(
    "This runtime has no module.registerHooks; Deno 2.x or a runtime implementing it is required.",
  );

// A preload takes no arguments, so the one thing that has to be configurable
// — which config describes the project — is read from the environment.
const configFile = globalThis.process?.env?.["SWEETENER_CONFIG"];

registerHooks(
  createSweetenerHooks(configFile === undefined ? {} : { configFile }),
);
