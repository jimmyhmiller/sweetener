import "../../macro-suite/theme.css";
import { cardMarkup } from "../../macro-suite/render";
import { showcase } from "../../macro-suite/showcase.sts";
document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  `<main><h1>${showcase.title}</h1><p>${showcase.subtitle}</p><p class="hero">${showcase.hero}</p><section class="grid">${showcase.cards.map(cardMarkup).join("")}</section></main>`;
