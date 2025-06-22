<!-- VolumeMeter.svelte -->
<script lang="ts">
    import { amplitudeToDB } from "$lib/audio/audio.svelte";
    
    let { fec, debug = false } = $props();
    
    let rnd = (v) => Math.round(v * 1000) / 1000
    let peakLevel = $derived(fec.peakLevel)
    let volumeLevel = $derived(rnd(fec.volumeLevel));
    let isAutoGain = $derived(fec.constructor.name === 'AutoGainorator');
    
    // Calculate dB values for AutoGain debug
    let volDB = $derived(rnd(volumeLevel > 0 ? amplitudeToDB(volumeLevel) : -Infinity));
    let peakDB = $derived(rnd(peakLevel > 0 ? amplitudeToDB(peakLevel) : -Infinity));
    let gainDB = $derived(rnd(fec.gainValue ? amplitudeToDB(fec.gainValue) : -Infinity));
    
</script>

<div class="volume-meter">
    {#if debug}
        <div class="debug-info">
            <small>gain: {gainDB}dB</small>
            {#if isAutoGain}
                <small>target: {fec.targetPeakLevel}dB</small>
                <small>stable: {fec.stableTime || 0}ms</small>
            {/if}
            <small>vol: {volDB}dB</small>
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
        width: 5em;
        height: 30px;
        background-color: #e0e0e0;
        position: relative;
        overflow: hidden;
    }

    .meter-labels {
        width:3em;
        height:2em;
        position:relative;
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
        color: #2c0202;
        margin-bottom: 0.2em;
    }
</style>