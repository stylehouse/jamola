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
        {con.name}
    {/snippet}
    </Knob>
</label>
<button>

</button>
<style>

</style>