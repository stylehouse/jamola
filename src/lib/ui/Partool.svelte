<script lang="ts">
    let {par} = $props();
    function Hi() {
        console.log("Hi",par.gain.output)
        return console.log("Hi",par.cooked)
        let stream = par.gain.output
        const track = stream.getTracks()[0];
        console.log('Track state:', {
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
        });
    }
</script>

<button onclick={()=>Hi()}>Hi</button>

<style>
    button {
        font-size:2em;
    }
</style>