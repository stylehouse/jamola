<script lang="ts">
    let {par} = $props();
    let sharing:Sharing = par.sharing
    let list = $derived(JSON.stringify(sharing.list))
</script>

{#if !sharing.started}<button onclick={() => sharing.start()}>start</button>{/if}

SHARING to ${par}
got ${list}