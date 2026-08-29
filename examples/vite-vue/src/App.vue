<script setup lang="ts">
import { showcase } from "../../macro-suite/showcase.sts";
</script>
<template>
  <main>
    <h1>{{ showcase.title }}</h1>
    <p>{{ showcase.subtitle }}</p>
    <p class="hero">{{ showcase.hero }}</p>
    <section class="grid">
      <article v-for="card in showcase.cards" :key="card.name">
        <small>{{ card.kind }}</small>
        <h2>{{ card.name }}</h2>
        <p>{{ card.result }}</p>
      </article>
    </section>
  </main>
</template>
