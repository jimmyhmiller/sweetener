import SourceMapModule from "@parcel/source-map";
import { Transformer } from "@parcel/plugin";
import { createSweetenerSession } from "@sweetener/compiler";

const session = createSweetenerSession();

export default new Transformer({
  async transform({ asset, options }) {
    const result = await session.transform({
      code: await asset.getCode(),
      filename: asset.filePath,
      mode: options.mode === "production" ? "production" : "development",
    });
    if (result.diagnostics.length > 0)
      throw new Error(
        result.diagnostics
          .map(({ messageText }) => String(messageText))
          .join("\n"),
      );
    for (const dependency of result.dependencies)
      asset.invalidateOnFileChange(dependency);
    asset.type = result.virtualFilename.endsWith("x") ? "tsx" : "ts";
    asset.setCode(result.code);
    const map = new SourceMapModule.default(options.projectRoot);
    map.addVLQMap({
      ...result.map,
      sources: [...result.map.sources],
      sourcesContent: [...(result.map.sourcesContent ?? [])],
      names: [...result.map.names],
    });
    asset.setMap(map);
    return [asset];
  },
});
