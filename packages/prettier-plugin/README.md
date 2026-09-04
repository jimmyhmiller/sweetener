# `@sweetener/prettier-plugin`

Prettier support for `.sts` and `.stsx` source files.

```js
// prettier.config.mjs
import sweetener from "@sweetener/prettier-plugin";

export default { plugins: [sweetener] };
```

The formatter uses Sweetener's lossless reader to identify compile-time imports
and imported item-macro prefixes, masks those extensions while Prettier formats
the surrounding TypeScript or TSX, and then restores the authored Sweetener
syntax. This lets application code receive normal TypeScript and JSX wrapping.

When a file contains syntax that cannot yet be represented as TypeScript, the
formatter falls back to conservative delimiter-based indentation. Template
literal contents and JSX trees remain lossless in that fallback because their
whitespace can be observable.

Malformed delimiter structure is reported as a formatting error. Formatting
is idempotent.
