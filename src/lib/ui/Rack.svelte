<script lang="ts">
    import RackFec from "./RackFec.svelte";

    let {par} = $props()

    // < take over volumeChange from above, directly on the par.effect.*
    let volumeLevel = $derived(par.gain.volumeLevel)
    let peakLevel = $derived(par.gain.peakLevel)
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

        <div class="volume-meter">
            <div class="meter-container">
                <div 
                    class="meter-fill" 
                    style="width: {volumeLevel * 100}%; 
                           background-color: {peakLevel > 0.94 ? 'red' : peakLevel > 0.8 ? 'orange' : 'green'};"
                ></div>
            </div>
            <div class="meter-labels">
                {#if peakLevel > 0.9}
                    <span class="clipping-warning">Clipping!</span>
                {/if}
            </div>
        </div>

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



    .volume-meter {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100px;
    }

    .meter-container {
        width: 100px;
        height: 30px;
        background-color: #e0e0e0;
        position: relative;
        overflow: hidden;
    }

    .meter-fill {
        position: absolute;
        bottom: 0;
        height: 100%;
        background-color: green;
        transition: width 0.1s;
    }

    .clipping-warning {
        color: red;
        font-weight: bold;
    }
</style>