<script lang="ts">
    import { Peerily } from "$lib/trusty/Peerily.svelte";
    import { bunch_of_nowish } from "$lib/trusty/ws-server/PeerilySignalingServer";
    import ByURL from "./trusty/ByURL.svelte";
    import Signal from "./trusty/Signal.svelte";

    let P = new Peerily()
    // P.stash persists
    $effect(() => {
        if (localStorage.Astash) {
            console.log(`loading Astash`)
            P.stash = JSON.parse(localStorage.Astash)
        }
    })
    $effect(() => {
        if (!P.stash) return
        console.log(`saving Astash`)
        localStorage.Astash = JSON.stringify(P.stash)
    })
    $effect(() => {
        setTimeout(() => P.begin(),0)
    })


</script>s

<ByURL {P} />
<Signal {P} />

<p>Everything.</p>

<button >New ID</button>
