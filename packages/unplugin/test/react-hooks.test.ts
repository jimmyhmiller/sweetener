import { resolve } from "node:path";
import { createServer } from "vite";
import { describe, expect, test } from "vitest";

const exampleRoot = resolve(
  import.meta.dirname,
  "../../../examples/vite-react",
);

describe("React hook macro integration", () => {
  test("preserves React Fast Refresh instrumentation in the Vite dev pipeline", async () => {
    const server = await createServer({
      root: exampleRoot,
      logLevel: "silent",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true },
    });
    try {
      const result = await server.transformRequest("/src/main.stsx");
      expect(result?.code).toContain("useState");
      expect(result?.code).toContain("useEffect");
      expect(result?.code).toMatch(
        /\$RefreshReg\$|registerExportsForReactRefresh/u,
      );
      expect(result?.code).not.toContain("for syntax");
      expect(result?.code).not.toContain("state count");
    } finally {
      await server.close();
    }
  });
});
