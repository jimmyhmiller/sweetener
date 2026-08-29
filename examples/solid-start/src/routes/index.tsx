import "../../../macro-suite/theme.css";
import { showcase } from "../../../macro-suite/showcase.sts";
export default function Home() {
  return (
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
}
