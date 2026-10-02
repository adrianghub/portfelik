<script lang="ts">
  import { releaseChannel, releaseChannelLabel } from "$lib/release-channel";
</script>

{#if releaseChannel !== "stable"}
  <div class="beta-ribbon" title={releaseChannelLabel}>
    <span class="sr-only">{releaseChannelLabel}</span>
    <span class="beta-ribbon__band" aria-hidden="true">BETA</span>
  </div>
{/if}
