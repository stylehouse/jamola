<script lang="ts">
    import { Peerily } from "$lib/trusty/Peerily.svelte";
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
    let tryit = () => {
        P.connect_pubkey("7c225f82554d67c6")
    }

</script>

<ByURL {P} />
<Signal {P} />

<p><a href="/A?3#7c225f82554d67c6">Everything.</a></p>

<button onclick={tryit}>go</button>
