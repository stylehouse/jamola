<script lang="ts">
    import RackFecCon from "./RackFecCon.svelte";
    import VolumeMeter from "./VolumeMeter.svelte";
    let {fec} = $props()
</script>



<span class="effect ">
    <span class="theyname" 
        onclick={() => console.log("fec: ",fec) }
        role=button
        title={fec.name}
        >
        {fec.name}
    </span>
    <span class="bits" >
        {#each fec.controls as con (con.fec_key)}
            <RackFecCon {con}></RackFecCon>
        {/each}

        {#if fec.volumeLevel != null}
            <VolumeMeter {fec} debug={true} />
        {/if}
    </span>

</span>

<style>
    .effect {
        border:2px solid black;
        border-radius:1em;
        border-left:none;
        min-height:3em;
        min-width:1em;
        position:relative;
        display:inline-block;
        padding-left:1em;
        bottom: 0em;
        overflow: hidden;
        background-color: rgb(17, 73, 73);
        padding-left: 1.6em;
    }

    .effect:hover {
        /* overflow: visible; */
        /* transform: rotate(-5deg) skew(15deg) translate(3px, -2%) scale(1.1);
        transform-origin: top left; */
    }

    .bits {
        z-index:5;
        position:relative;
    }
    .effect .theyname {
        position: absolute;
        left:0em;
        top:0em;
        transform: rotate(90deg) skew(15deg) translate(3px, -97%);
        transform-origin: top left;
        /* pointer-events:none; */
        background:orange;
        z-index:2;
    }
</style>