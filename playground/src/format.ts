import { formatSweetenerWithPrettier } from "@sweetener/prettier-plugin";

const sweetenerExtension = /\.stsx?$/u;

export async function formatPlaygroundFile(
  fileName: string,
  source: string,
): Promise<string> {
  if (sweetenerExtension.test(fileName))
    return formatSweetenerWithPrettier(source, { filepath: fileName });

  const [{ format }, typescriptPlugin, estreePlugin] = await Promise.all([
    import("prettier/standalone"),
    import("prettier/plugins/typescript"),
    import("prettier/plugins/estree"),
  ]);
  return format(source, {
    filepath: fileName,
    parser: "typescript",
    plugins: [typescriptPlugin, estreePlugin],
  });
}
