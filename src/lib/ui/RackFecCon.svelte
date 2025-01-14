<script lang="ts">
    import Knob from "./Knob.svelte";
    let {con} = $props()
    // non-reactive, unless ~ui_version
    let Knob_props = $derived(con.ui_version && con.Knob_props);
</script>
<label class=acontrol>
    <!-- con.name will appear here, and interact as part of the knob -->
    <Knob
        {...Knob_props}
    >
    {#snippet label()}
        <span class=maxout>
            {con.name}
        </span>
    {/snippet}
    </Knob>
</label>
<style>
    .maxout {
        width:100%;
        height:100%;
        display:inline-block;
    }
</style>