<script lang="ts">
    let { fec, debug = false } = $props();
    
    let volumeLevel = $derived(fec.volumeLevel);
    let peakLevel = $derived(fec.peakLevel);
    
    // Debug logging to track the drift issue
    $effect(() => {
        if (0 && debug) {
            console.log(`[VolumeMeter Debug] volumeLevel: ${volumeLevel},`
                +` peakLevel: ${peakLevel}, gain: ${fec.gain?.value || 'N/A'}`);
        }
    });
</script>

<div class="volume-meter">
    {#if debug}
        <div class="debug-info">
            <small>vol: {Math.round(volumeLevel * 1000) / 1000}</small>
            <small>peak: {Math.round(peakLevel * 1000) / 1000}</small>
            <small>gain: {Math.round((fec.gainValue || 0) * 1000) / 1000}</small>
        </div>
    {/if}
    
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

<style>
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
    
    .debug-info {
        display: flex;
        gap: 0.5em;
        font-size: 0.7em;
        color: #666;
        margin-bottom: 0.2em;
    }
</style>