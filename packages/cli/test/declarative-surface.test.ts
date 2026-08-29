import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runConfiguredProjectCommand } from "../src/index.js";

interface Expansion {
  readonly text: string;
  readonly messages: readonly string[];
}

function expand(
  macros: string,
  main: string,
  jsx?: { readonly runtime: string },
): Expansion {
  const directory = mkdtempSync(join(tmpdir(), "sweet-surface-"));
  const entry = jsx === undefined ? "main.sts" : "main.stsx";
  writeFileSync(join(directory, "macros.sts"), macros);
  writeFileSync(join(directory, entry), main);
  if (jsx !== undefined) {
    writeFileSync(join(directory, "jsx-runtime.ts"), jsx.runtime);
  }
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        ...(jsx === undefined
          ? {}
          : {
              jsx: "react",
              jsxFactory: "h",
              jsxFragmentFactory: "Fragment",
            }),
      },
      sweet: { macroExtensions: [".sts", ".stsx"] },
      files: [
        ...(jsx === undefined ? [] : ["jsx-runtime.ts"]),
        "macros.sts",
        entry,
      ],
    }),
  );
  const result = runConfiguredProjectCommand({
    command: "check",
    configPath: join(directory, "tsconfig.json"),
    writeThrough: false,
  });
  const generated = result.virtualFiles.find(({ fileName }) =>
    fileName.endsWith(jsx === undefined ? "main.ts" : "main.tsx"),
  )?.generated.text;
  if (generated === undefined) throw new Error(`${entry} was not expanded`);
  return {
    text: generated.replaceAll(/\s+/gu, " ").trim(),
    messages: result.diagnostics.map(({ messageText }) => String(messageText)),
  };
}

describe("optional captures", () => {
  test("give an empty sequence to a template repetition when absent", () => {
    const { text } = expand(
      `export syntax atLeast:expr {
         rule { atLeast($($bound:expr)?) } => { [true $(&& $bound)*] }
       }`,
      `import { atLeast } from "./macros.sts" for syntax;
       declare const size: number;
       export const none = atLeast();
       export const some = atLeast(size > 0);`,
    );
    expect(text).toContain("export const none = [true]");
    expect(text).toContain("export const some = [true&&size > 0]");
  });

  test("answer #if(present) rather than failing when absent", () => {
    const { text } = expand(
      `export syntax atLeast:expr {
         rule { atLeast($($bound:expr)?) } => {
           [#if(present $bound) { $($bound)* } #else { true }]
         }
       }`,
      `import { atLeast } from "./macros.sts" for syntax;
       declare const size: number;
       export const none = atLeast();
       export const some = atLeast(size > 0);`,
    );
    expect(text).toContain("export const none = [ true]");
    expect(text).toContain("export const some = [size > 0]");
  });

  test("let a syntax class declare a field a rule may omit", () => {
    const { text, messages } = expand(
      `export syntax class Arm {
         fields {
           pattern: tt;
           guard: expr?;
           body: expr;
         }

         rule { $pattern:tt if ($guard:expr) => $body:expr }
         rule { $pattern:tt => $body:expr }
       }

       export syntax arms:expr {
         rule { arms { $($arm:Arm),+ } } => {
           [$([$arm.body, #if(present $arm.guard) { $arm.guard } #else { true }]),*]
         }
       }`,
      `import { arms } from "./macros.sts" for syntax;
       declare const size: number;
       export const table = arms { _ => 1, 2 if (size > 0) => 3 };`,
    );
    expect(messages).toEqual([]);
    expect(text).toContain("[[ 1, true],[ 3,size > 0]]");
  });
});

describe("declarative surface", () => {
  test("accepts a contextual keyword where an identifier is expected", () => {
    // TypeScript scans `type` as a keyword, but it is an ordinary identifier in
    // a property position, which is where discriminated unions put it.
    const { text } = expand(
      `export syntax fieldName:expr {
         rule { fieldName($subject:expr, $name:ident) } => {
           ($subject)[#text($name)]
         }
       }`,
      `import { fieldName } from "./macros.sts" for syntax;
       declare const event: Record<string, unknown>;
       export const kind = fieldName(event, type);
       export const other = fieldName(event, plain);`,
    );
    expect(text).toContain('(event)["type"]');
    expect(text).toContain('(event)["plain"]');
  });

  test("separates a template keyword from the capture that follows it", () => {
    const { text, messages } = expand(
      `export syntax kindOf:expr {
         rule { kindOf($value:expr) } => { typeof $value }
       }`,
      `import { kindOf } from "./macros.sts" for syntax;
       const event = 1;
       export const named = kindOf(event);`,
    );
    expect(messages).toEqual([]);
    expect(text).toContain("typeof event");
  });

  test("lets a rule expand to nothing", () => {
    const { text, messages } = expand(
      `export syntax erase:stmt {
         rule { erase($value:expr); } => { }
       }`,
      `import { erase } from "./macros.sts" for syntax;
       export function run(): number {
         const kept = 1;
         erase(kept);
         return kept;
       }`,
    );
    expect(messages).toEqual([]);
    expect(text).toContain("const kept = 1;; return kept;");
  });

  test("claims a macro extent that reaches past the expression", () => {
    // `block (x) { ... }` ends with a brace an ordinary expression parse would
    // leave behind as a separate statement.
    const macros = `export syntax block:expr {
         rule { block ($value:expr) { $($step:expr),+ } } => {
           [$value $(, $step)+]
         }
       }`;
    const { text, messages } = expand(
      macros,
      `import { block } from "./macros.sts" for syntax;
       declare const seed: number;
       export function run(): number[] {
         return block (seed) { 1, 2 };
       }
       export function keep(): number[] {
         const held = block (seed) { 3 };
         return held;
       }`,
    );
    expect(messages).toEqual([]);
    expect(text).toContain("return [seed, 1, 2]");
    expect(text).toContain("const held = [seed, 3]");
  });

  test("does not put a line break between return and its expression", () => {
    const { text, messages } = expand(
      // The template body starts on its own line in the definition.
      `export syntax wrapped:expr {
         rule { wrapped($value:expr) } => {
           [$value]
         }
       }`,
      `import { wrapped } from "./macros.sts" for syntax;
       export function run(): number[] {
         return wrapped(1);
       }`,
    );
    expect(messages).toEqual([]);
    // A newline here would end the statement and return undefined.
    expect(text).toContain("return [1]");
  });

  test("reports a rule whose template does not compile and expands nothing", () => {
    const { text, messages } = expand(
      // `$bound` is a sequence, so reading it outside a repetition is an error.
      `export syntax broken:expr {
         rule { broken($($bound:expr)?) } => { [$bound] }
       }`,
      `import { broken } from "./macros.sts" for syntax;
       export const value = broken();`,
    );
    expect(messages).toContain("Capture $bound requires template depth 1.");
    // The invocation is left alone rather than expanding a template that
    // cannot be evaluated.
    expect(text).toContain("broken()");
  });
});

describe("JSX children", () => {
  const runtime = `export function h(
  tag: string,
  props: Readonly<Record<string, unknown>> | null,
  ...children: readonly unknown[]
): unknown {
  return { tag, props, children };
}
export const Fragment = "fragment";
declare global {
  namespace JSX {
    type Element = unknown;
    type ElementType = string;
    interface IntrinsicElements {
      readonly [tag: string]: unknown;
    }
  }
}`;

  test("dispatch a macro whose invocation spans several children", () => {
    const { text, messages } = expand(
      `export syntax each:jsxChild {
         rule { {each ($items:expr as $item:binding)} $body:jsxChild {end} }
         bind $item in $body as lexical value;
         => { {($items).map(($item) => $body)} }
       }`,
      `import { each } from "./macros.sts" for syntax;
       import { Fragment, h } from "./jsx-runtime.js";
       void h;
       void Fragment;
       export const list = (
         <ul>
           {each ([1, 2] as value)}
             <li>{value}</li>
           {end}
         </ul>
       );`,
      { runtime },
    );
    expect(messages).toEqual([]);
    // The head, the body, and the closing brace were one invocation.
    expect(text).toContain("([1, 2]).map(( value) =>");
    expect(text).not.toContain("{end}");
  });

  test("expand an attribute value as an expression, not a child", () => {
    const { text, messages } = expand(
      `export syntax twice:expr {
         rule { twice($value:expr) } => { [$value, $value] }
       }`,
      `import { twice } from "./macros.sts" for syntax;
       import { Fragment, h } from "./jsx-runtime.js";
       void h;
       void Fragment;
       export const item = <li data={twice(1)}>{twice(2)}</li>;`,
      { runtime },
    );
    expect(messages).toEqual([]);
    // An attribute sits before the tag closes, so it is not a child.
    expect(text).toContain("data={ [1,1]}");
    expect(text).toContain(">{ [2,2]}<");
  });
});

describe("binder position", () => {
  const macros = `export syntax pair:binding {
       rule { pair($left:binding, $right:binding) } => { [$left, $right] }
     }
     export syntax boxed:binding {
       rule { boxed($name:binding) } => { { value: $name } }
     }`;

  test("dispatches a macro standing where a declaration names its binding", () => {
    const { text, messages } = expand(
      macros,
      `import { pair } from "./macros.sts" for syntax;
       declare const values: readonly number[];
       const pair(first, second) = values;
       export const total = first + second;
       export function inside(more: readonly number[]): number {
         let pair(third, fourth) = more;
         return third + fourth;
       }`,
    );
    expect(messages).toEqual([]);
    expect(text).toContain("const [first, second] = values");
    expect(text).toContain("let [third, fourth] = more");
  });

  test("leaves an ordinary binder exactly as written", () => {
    const { text, messages } = expand(
      macros,
      `import { pair } from "./macros.sts" for syntax;
       export const plain = 1;
       export const { destructured } = { destructured: 2 };`,
    );
    expect(messages).toEqual([]);
    expect(text).toContain("export const plain = 1");
    expect(text).toContain("const { destructured } =");
  });

  test("renames what a binder macro introduces of its own", () => {
    const { text, messages } = expand(
      macros,
      `import { boxed } from "./macros.sts" for syntax;
       declare const source: { readonly value: number };
       const value = "call-site value";
       const boxed(held) = source;
       export const kept: readonly [string, number] = [value, held];`,
    );
    expect(messages).toEqual([]);
    // The property the macro writes keeps its spelling; the caller's binding
    // of the same name is untouched.
    expect(text).toContain("const { value:held } = source");
    expect(text).toContain('const value = "call-site value"');
  });
});
