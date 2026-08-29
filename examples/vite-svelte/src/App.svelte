<script lang="ts">import { showcase } from "../../macro-suite/showcase.sts";</script>
<main><h1>{showcase.title}</h1><p>{showcase.subtitle}</p><p class="hero">{showcase.hero}</p><section class="grid">{#each showcase.cards as card}<article><small>{card.kind}</small><h2>{card.name}</h2><p>{card.result}</p></article>{/each}</section></main>
