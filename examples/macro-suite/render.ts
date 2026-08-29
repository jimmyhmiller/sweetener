import type { MacroCard } from "./showcase.sts";

export function cardMarkup(card: MacroCard): string {
  return `<article><small>${card.kind}</small><h2>${card.name}</h2><p>${card.result}</p></article>`;
}
