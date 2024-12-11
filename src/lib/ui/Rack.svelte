<script lang="ts">
    import Knob from "./Knob.svelte";

    let {par} = $props()
    // < take over volumeChange from above, directly on the par.effect.*
    let volumeLevel = $derived(par.gain.volumeLevel)
    let peakLevel = $derived(par.gain.peakLevel)
</script>

    {#if par.gain}<span class="bitrate">{Math.round(par.gain.peakLevel*1000)/1000} dB</span
        >{/if}
    {#if par.bitrate}<span class="bitrate" style="filter:hue(45deg)">{par.bitrate} kbps</span
        >{/if}
    {#if par.latency}<span class="bitrate latency">{par.latency} ms</span
        >{/if}

        <div class="volume-meter">
            <div class="meter-container">
                <div 
                    class="meter-fill" 
                    style="height: {volumeLevel * 100}%; 
                           background-color: {peakLevel > 0.9 ? 'red' : peakLevel > 0.8 ? 'orange' : 'green'};"
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
            <span class="effect ">
                <span class="theyname" 
                    onclick={() => console.log("fec: ",fec) }
                    role="button"
                    >{fec.name}</span>

                    {#each fec.controls as con (con.this_key)}
                        <label>
                            {con.name}
                            <Knob
                                {...con.get_Knob_props()}
                            >
                            </Knob>
                        </label>
                    {/each}

            </span>
        {/each}

<style>
    .effect {
        border:2px solid black
    }

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
        width: 100%;
        background-color: green;
        transition: height 0.1s;
    }

    .clipping-warning {
        color: red;
        font-weight: bold;
    }
</style>