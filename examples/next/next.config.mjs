import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
export default {
  turbopack: {
    root: resolve(here, "../.."),
    rules: {
      "*.sts": {
        loaders: [
          {
            loader: require.resolve("@sweetener/webpack-loader"),
            options: { configFile: resolve(here, "../sweetener.json") },
          },
        ],
        as: "*.ts",
      },
    },
  },
};
