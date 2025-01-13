<script lang="ts">
    import RackFecCon from "./RackFecCon.svelte";
    let {fec} = $props()
</script>



<span class="effect ">
    <span class="theyname" 
        onclick={() => console.log("fec: ",fec) }
        role="button"
        >{fec.name}</span>

        {#each fec.controls as con (con.fec_key)}
            <RackFecCon {con}></RackFecCon>
        {/each}

</span>

<style>
    .effect {
        border:2px solid black;
        border-radius:1em;
        border-left:none;
        min-height:3em;
        position:relative;
        display:inline-block;
    }
    .effect .theyname {
        position: absolute;
        bottom: 0px;
        margin-right: -2em;
        transform: rotate(-90deg) skew(25deg);
        transform-origin: bottom left;
        pointer-events:none;
    }
</style>