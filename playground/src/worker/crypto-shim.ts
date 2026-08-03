class BrowserHash {
  #text = "";
  update(value: string): this {
    this.#text += value;
    return this;
  }
  digest(): string {
    let hash = 2166136261;
    for (let index = 0; index < this.#text.length; index += 1) {
      hash ^= this.#text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
}
export const createHash = (algorithm: string) => {
  void algorithm;
  return new BrowserHash();
};
