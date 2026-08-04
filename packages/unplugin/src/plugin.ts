import { createSweetenerSession } from "@sweetener/compiler";
import { createUnplugin } from "unplugin";

export interface SweetenerPluginOptions {
  readonly configFile?: string | undefined;
  readonly include?: RegExp | undefined;
}

const defaultInclude = /\.s(?:ts|js)x?(?:\?.*)?$/u;

export const sweetenerUnplugin = createUnplugin<
  SweetenerPluginOptions | undefined
>((options = {}, meta) => {
  const session = createSweetenerSession();
  const include = options.include ?? defaultInclude;
  return {
    name: "sweetener",
    enforce: "pre",
    async transform(code, id) {
      const filename = id.replace(/[?#].*$/u, "");
      if (!include.test(id)) return;
      try {
        const result = await session.transform({
          code,
          filename,
          configFile: options.configFile,
          mode: "development",
        });
        for (const dependency of result.dependencies)
          this.addWatchFile(dependency);
        if (result.diagnostics.length > 0) {
          const message = result.diagnostics
            .map(
              ({ code: diagnosticCode, messageText }) =>
                `SWR${String(diagnosticCode)} ${String(messageText)}`,
            )
            .join("\n");
          this.error(message);
        }
        return {
          code: result.code,
          // Build tools commonly enrich maps in place, so do not expose the
          // compiler session's immutable cached value directly.
          map: {
            ...result.map,
            sources: [...result.map.sources],
            sourcesContent: [...(result.map.sourcesContent ?? [])],
            names: [...result.map.names],
          },
        };
      } catch (error) {
        const normalized =
          error instanceof Error ? error : new Error(String(error));
        this.error(meta.framework === "farm" ? normalized.message : normalized);
      }
    },
    watchChange(id) {
      session.invalidate([id]);
    },
  };
});

export const vite = sweetenerUnplugin.vite;
export const rollup = sweetenerUnplugin.rollup;
export const rolldown = sweetenerUnplugin.rolldown;
export const webpack = sweetenerUnplugin.webpack;
export const rspack = sweetenerUnplugin.rspack;
export const rsbuild = sweetenerUnplugin.rsbuild;
export const esbuild = sweetenerUnplugin.esbuild;
export const bun = sweetenerUnplugin.bun;
