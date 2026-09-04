import type { Parser, Plugin, Printer } from "prettier";
import { formatSweetener, type SweetenerFormatOptions } from "./format.js";

interface SweetenerAst {
  readonly type: "SweetenerDocument";
  readonly source: string;
}

const parser: Parser<SweetenerAst> = {
  astFormat: "sweetener-document",
  parse(text) {
    return { type: "SweetenerDocument", source: text };
  },
  locStart() {
    return 0;
  },
  locEnd(node) {
    return node.source.length;
  },
};

const printer: Printer<SweetenerAst> = {
  print(path, options) {
    return formatSweetener(path.node.source, options as SweetenerFormatOptions);
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
export default plugin;
