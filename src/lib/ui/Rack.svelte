<script lang="ts">
    import RackFec from "./RackFec.svelte";
    import VolumeMeter from "./audio/VolumeMeter.svelte";

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

    {#if par.gain}
        <VolumeMeter gainorator={par.gain} debug={true} />
    {/if}
    {#if par.autogain}
        <VolumeMeter gainorator={par.autogain} debug={true} />
    {/if}
    {#if par.alsogain}
        <VolumeMeter gainorator={par.alsogain} debug={true} />
    {/if}

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