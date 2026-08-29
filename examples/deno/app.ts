import { showcase } from "./.sweetener/showcase.ts";

export function page(): string {
  const cards = showcase.cards
    .map(
      (card) =>
        `<article><small>${card.kind}</small><h2>${card.name}</h2><p>${card.result}</p></article>`,
    )
    .join("");
  return `<!doctype html><html><head><title>${showcase.title}</title></head><body><main><h1>${showcase.title}</h1><p>${showcase.subtitle}</p><p>${showcase.hero}</p><section>${cards}</section></main></body></html>`;
}

if (import.meta.main) {
  Deno.serve({ port: 8000 }, () =>
    Promise.resolve(
      new Response(page(), { headers: { "content-type": "text/html" } }),
    ),
  );
}
