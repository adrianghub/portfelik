<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  onMount(() => {
    void goto("/transactions?status=upcoming&forecast=recurring", { replaceState: true });
  });
</script>
