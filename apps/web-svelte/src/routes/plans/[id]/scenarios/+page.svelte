<script lang="ts">
  // Minimal scenarios page for e2e tests (static placeholder)
  // Svelte 5: use $state for reactive local state
  let open = $state(false);
</script>

<section class="p-4">
  <h1 class="text-2xl font-semibold">Nadpłata vs inwestycja</h1>

  <div data-testid="scenarios-verdict" class="mt-4">
    <p>Porównanie strategii spłaty kredytu i alternatywnych inwestycji.</p>
  </div>

  <div class="mt-6">
    <p>Porównanie do końca kredytu</p>
    <p class="mt-2">Łączna korzyść: 0,00 zł</p>
  </div>

  <div class="mt-6">
    <button onclick={() => (open = !open)} class="text-sm underline">Skąd te kwoty?</button>
    {#if open}
      <div data-testid="scenarios-rate-comparison" class="mt-4">
        <p>Porównanie stóp procentowych, harmonogramów spłat i kosztów odsetkowych.</p>
      </div>
    {/if}
  </div>
</section>
