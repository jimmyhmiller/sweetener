// Assertions run with `deno run`, not `deno test`.
//
// A loader hook is installed after Deno has built the module graph, and
// `deno test` builds that graph up front, so it rejects a .sts import before
// the hook can answer for it. `deno run` resolves as it goes, which is what
// lets the hook work at all. The AOT path below is what a project needing
// `deno test` or `deno check` should use.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { showcase } from "../macro-suite/showcase.sts";
import { page } from "./app.ts";

assertEquals(showcase.copiedNumbers, [42, 42]);
assertEquals(showcase.audit, ["macro pass 1", "macro pass 2", "macro pass 3"]);
assertStringIncludes(page(), "SWEETENER MACRO CARNIVAL");

console.log("Deno ran macro sources directly through the loader hook.");
