# `@sweetener/prettier-plugin`

Prettier support for `.sts` and `.stsx` source files.

```js
// prettier.config.mjs
import sweetener from "@sweetener/prettier-plugin";

export default { plugins: [sweetener] };
```

The first release is deliberately conservative. It uses Sweetener's lossless
reader to normalize indentation, line endings, blank lines, trailing
whitespace, and the final newline without needing to understand user-defined
syntax. Inline spelling is preserved. Template literal contents and JSX trees
are kept lossless because whitespace can be observable there.

Malformed delimiter structure is reported as a formatting error. Formatting
is idempotent.
