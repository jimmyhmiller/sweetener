import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { transformAsync } from "@babel/core";
import typescript from "@babel/preset-typescript";
import { createSweetenerSession, loadSweetProject } from "@sweetener/compiler";

interface TransformerConfig {
  readonly configFile?: string | undefined;
}

interface JestTransformOptions {
  readonly config: { readonly rootDir: string };
  readonly transformerConfig: TransformerConfig;
}

const transformer = {
  async getCacheKeyAsync(
    sourceText: string,
    sourcePath: string,
    options: JestTransformOptions,
  ): Promise<string> {
    const hash = createHash("sha256");
    hash.update(sourceText);
    hash.update(sourcePath);
    const configFile = options.transformerConfig.configFile;
    if (configFile !== undefined) {
      const project = loadSweetProject(configFile);
      hash.update(readFileSync(configFile));
      for (const file of [...project.typescript.fileNames].sort())
        hash.update(readFileSync(file));
    }
    return hash.digest("hex");
  },
  async processAsync(
    sourceText: string,
    sourcePath: string,
    options: JestTransformOptions,
  ): Promise<{ code: string; map?: unknown }> {
    const session = createSweetenerSession();
    try {
      const expanded = await session.transform({
        code: sourceText,
        filename: sourcePath,
        configFile: options.transformerConfig.configFile,
        mode: "test",
      });
      if (expanded.diagnostics.length > 0)
        throw new Error(
          expanded.diagnostics
            .map(({ messageText }) => String(messageText))
            .join("\n"),
        );
      const babel = await transformAsync(expanded.code, {
        filename: expanded.virtualFilename,
        presets: [typescript],
        sourceMaps: true,
        inputSourceMap: {
          ...expanded.map,
          file: expanded.map.file ?? expanded.virtualFilename,
          sources: [...expanded.map.sources],
          sourcesContent: (expanded.map.sourcesContent ?? []).map(
            (content) => content ?? "",
          ),
          names: [...expanded.map.names],
        },
      });
      if (babel?.code === undefined || babel.code === null)
        throw new Error("Babel produced no Jest transform");
      return { code: babel.code, map: babel.map };
    } finally {
      await session.close();
    }
  },
};

export default transformer;
