<script lang="ts">
    import RackFec from "./RackFec.svelte";

    let {par} = $props()

    let latency = $derived(
        par.latency == null ? null :
            par.latency * 1000 // s to ms
    )

</script>

    {#if 0 && par.gain}<span class="bitrate">{Math.round(par.gain.peakLevel*1000)/1000} dB</span
        >{/if}
    {#if par.bitrate}<span class="bitrate" style="filter:hue(45deg)">{par.bitrate} kbps</span
        >{/if}
    {#if latency}<span class="bitrate latency">{latency} ms</span
        >{/if}

<!-- all the effects themselves, to be verbose -->
        {#each par.effects as fec}
            <RackFec {fec}></RackFec>
        {/each}

<style>
    .bitrate {
        width:2em;
    }
    .latency {
        color:#2d0768
    }
</style>