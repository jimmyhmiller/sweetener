import { createSweetenerSession } from "@sweetener/compiler";
import type { LoaderContext } from "webpack";

export interface SweetenerLoaderOptions {
  readonly configFile?: string | undefined;
}

const sessions = new WeakMap<
  object,
  ReturnType<typeof createSweetenerSession>
>();

function sessionFor(context: LoaderContext<SweetenerLoaderOptions>) {
  const owner = (context._compiler as object | undefined) ?? context;
  const existing = sessions.get(owner);
  if (existing !== undefined) return existing;
  const session = createSweetenerSession();
  sessions.set(owner, session);
  return session;
}

export default function sweetenerLoader(
  this: LoaderContext<SweetenerLoaderOptions>,
  source: string,
): void {
  const callback = this.async();
  const options = this.getOptions?.() ?? {};
  void sessionFor(this)
    .transform({
      code: source,
      filename: this.resourcePath,
      configFile: options.configFile,
      mode: this.mode === "production" ? "production" : "development",
    })
    .then((result) => {
      for (const dependency of result.dependencies)
        this.addDependency(dependency);
      if (result.diagnostics.length > 0)
        throw new Error(
          result.diagnostics
            .map(({ messageText }) => String(messageText))
            .join("\n"),
        );
      callback(null, result.code, {
        ...result.map,
        file: result.map.file ?? result.virtualFilename,
        sources: [...result.map.sources],
        sourcesContent: (result.map.sourcesContent ?? []).map(
          (content) => content ?? "",
        ),
        names: [...result.map.names],
      });
    }, callback);
}
