<script lang="ts">
    let {par} = $props();
    let sharing:Sharing = par.sharing
    function start() {
        sharing.start()

    }
    $effect(() => {
        console.log("Starting!")
        sharing.start()
    })
    let list = $derived(JSON.stringify(sharing.list))
</script>
{#if !sharing.started}<button onclick={start}>start</button>{/if}
SHARING to ${par}
got ${list}