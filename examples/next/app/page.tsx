import { showcase } from "../../macro-suite/showcase.sts";
export default function Page() {
  return (
    <main>
      <h1>{showcase.title}</h1>
      <p>{showcase.subtitle}</p>
      <p className="hero">{showcase.hero}</p>
      <section className="grid">
        {showcase.cards.map((card) => (
          <article key={card.name}>
            <small>{card.kind}</small>
            <h2>{card.name}</h2>
            <p>{card.result}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
