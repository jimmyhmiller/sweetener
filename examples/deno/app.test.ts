import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { showcase } from "./.sweetener/showcase.ts";
import { page } from "./app.ts";

Deno.test("Deno executes the expanded macro carnival", () => {
  assertEquals(showcase.copiedNumbers, [42, 42]);
  assertEquals(showcase.audit, [
    "macro pass 1",
    "macro pass 2",
    "macro pass 3",
  ]);
  assertStringIncludes(page(), "SWEETENER MACRO CARNIVAL");
});
