type Option<T> = { readonly tag: "None" } | { readonly tag: "Some"; value: T };

const None = <T>(): Option<T> => ({ tag: "None" });
const Some = <T>(value: T): Option<T> => ({ tag: "Some", value });

export const result = {
  value: Some(3),
  run() {
    if (this.value.tag === "Some") {
      const { value } = this.value;
      return value + 1;
    }
    if (this.value.tag === "None") {
      return 0;
    }
    throw new globalThis.Error(
      "No match for " + globalThis.JSON.stringify(this.value),
    );
  },
}.run();

void None;
