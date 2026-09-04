import type { Parser, Plugin, Printer } from "prettier";
import type { SweetenerFormatOptions } from "./format.js";
import { formatSweetenerWithPrettier } from "./typescript-format.js";

interface SweetenerAst {
  readonly type: "SweetenerDocument";
  readonly source: string;
}

const parser: Parser<SweetenerAst> = {
  astFormat: "sweetener-document",
  async parse(text, options) {
    return {
      type: "SweetenerDocument",
      source: await formatSweetenerWithPrettier(
        text,
        options as SweetenerFormatOptions,
      ),
    };
  },
  locStart() {
    return 0;
  },
  locEnd(node) {
    return node.source.length;
  },
};

const printer: Printer<SweetenerAst> = {
  print(path) {
    return path.node.source;
  },
};

const plugin: Plugin<SweetenerAst> = {
  languages: [
    {
      name: "Sweetener TypeScript",
      parsers: ["sweetener"],
      extensions: [".sts"],
      vscodeLanguageIds: ["sweetener-typescript"],
    },
    {
      name: "Sweetener TSX",
      parsers: ["sweetener-tsx"],
      extensions: [".stsx"],
      vscodeLanguageIds: ["sweetener-typescriptreact"],
    },
  ],
  parsers: {
    sweetener: parser,
    "sweetener-tsx": parser,
  },
  printers: {
    "sweetener-document": printer,
  },
};

export { formatSweetener } from "./format.js";
export { formatSweetenerWithPrettier } from "./typescript-format.js";
export default plugin;
