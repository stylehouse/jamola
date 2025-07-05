<script lang="ts">
    import { bunch_of_nowish } from "$lib/trusty/ws-server/PeerilySignalingServer";
    import ByURL from "./trusty/ByURL.svelte";
    import Signal from "./trusty/Signal.svelte";

    let flo = {}
    // this should appear as it was before...
    flo.stash = {trust:{}}
    $effect(() => {
        if (localStorage.Astash) {
            flo.stash = JSON.parse(localStorage.Astash)
        }
    })
    flo.stashed = () => {
        // write changes
        localStorage.Astash = JSON.stringify(flo.stash)
    }
    let seekUd = $state()
    flo.seek_Id = (Ud) => {
        console.log("Will dial up "+(Ud.publicKey.slice(0,8)))
        seekUd = Ud
    }
    
    let arr = bunch_of_nowish()


</script>

<ByURL {flo} />
<Signal {flo} />

<p>Everything. {arr.join(" -> ")}</p>

<button >New ID</button>