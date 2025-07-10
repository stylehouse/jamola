<script lang="ts">
    import { Idento } from "$lib/trusty/Peer.svelte";
    import type { Peerily } from "$lib/trusty/Peerily.svelte";

    let {P}:{P:Peerily} = $props()
    // take someone's invite from the URL

    $effect(() => {
        setTimeout(startup,5)
    })
    
    let Id:Idento
    let Ud:Idento
    let link
    async function startup() {
        // yourself
        if (P.stash.Id) {
            P.Id.thaw(P.stash.Id)
        }
        else {
            // become someone
            await P.Id.generateKeys()
            P.stash.Id = P.Id.freeze()
        }

        // the location may be another persons
        Ud = new Idento()
        Ud.from_location_hash()
        // if it's not us
        if (Ud.publicKey && Ud.pretty_pubkey() != P.Id.pretty_pubkey()) {
            P.connect_pubkey(Ud)
        }
        // console.log("Id",Id.freeze())
        // console.log("Ud",Ud)

        // location becomes us, so we can share it easily
        link = P.Id.to_location_hash()
    }

    async function sharing() {
        console.log("Broadcast: ", Id)
        // puts this into the address bar
        let link = P.Id.to_location_hash()
        // < QR code, copyable link?
    }
</script>

<button onclick={sharing} >share</button>