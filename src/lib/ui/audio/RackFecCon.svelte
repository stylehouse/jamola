<script lang="ts">
    import Knob from "$lib/ui/Knob.svelte";
    let {con} = $props()
    let Knob_props = $derived(con.ui_version && con.Knob_props)
</script>
<label class=acontrol>
    <!-- con.name will appear here, and interact as part of the knob -->
    <!-- {#if Knob_props} -->
    <Knob
        {...Knob_props}
    >
        {#snippet label()}
            <span class=maxout>
                {con.name}
            </span>
        {/snippet}
    </Knob>
    <!-- {/if} -->
</label>
<style>
    button {
        font-size:2.1em;

    }
    .maxout {
        width:100%;
        height:100%;
        display:inline-block;
    }
</style>