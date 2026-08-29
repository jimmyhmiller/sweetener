import { transformWithOxc, type Plugin } from "vite";
import { vite, type SweetenerPluginOptions } from "./plugin.js";

const sweetExtension = /\.s(?:ts|js)x?(?:\?.*)?$/u;

/** Vite cannot infer a TypeScript loader from Sweetener's custom extensions. */
export default function sweetener(
  options: SweetenerPluginOptions = {},
): Plugin[] {
  const include = options.include ?? sweetExtension;
  return [
    vite(options) as Plugin,
    {
      name: "sweetener:vite-typescript",
      enforce: "pre",
      async transform(code, id) {
        if (!include.test(id)) return;
        const filename = id.replace(/[?#].*$/u, "");
        const javascript = /\.sjs(x)?$/u.exec(filename);
        const lang =
          javascript === null
            ? filename.endsWith("x")
              ? "tsx"
              : "ts"
            : javascript[1] === undefined
              ? "js"
              : "jsx";
        return transformWithOxc(code, filename, {
          lang,
          sourcemap: true,
        });
      },
    },
  ];
}
