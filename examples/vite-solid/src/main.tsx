import { render } from "solid-js/web";
import "../../macro-suite/theme.css";
import { showcase } from "../../macro-suite/showcase.sts";
const App = () => (
  <main>
    <h1>{showcase.title}</h1>
    <p>{showcase.subtitle}</p>
    <p class="hero">{showcase.hero}</p>
    <section class="grid">
      {showcase.cards.map((card) => (
        <article>
          <small>{card.kind}</small>
          <h2>{card.name}</h2>
          <p>{card.result}</p>
        </article>
      ))}
    </section>
  </main>
);
render(App, document.getElementById("root")!);
