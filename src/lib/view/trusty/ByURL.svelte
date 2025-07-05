<script lang="ts">
    import { Idento } from "$lib/trusty/Peer.svelte";

    let {flo} = $props()
    // take someone's invite from the URL

    $effect(() => {
        setTimeout(startup,5)
    })
    
    let Id:Idento
    let Ud:Idento
    let link
    async function startup() {
        // yourself
        flo.Id = Id = new Idento()
        if (flo.stash.Id) {
            Id.thaw(flo.stash.Id)
        }
        else {
            // become someone
            await Id.generateKeys()
            flo.stash.Id = Id.freeze()
            flo.stashed()
        }

        // the location may be another persons
        Ud = new Idento()
        Ud.from_location_hash()
        // if it's not us
        if (Ud.publicKey && Ud.pretty_pubkey() != Id.pretty_pubkey()) {
            flo.seek_Id(Ud)
        }
        // console.log("Id",Id.freeze())
        // console.log("Ud",Ud)

        // location becomes us, so we can share it easily
        link = Id.to_location_hash({short:true})
    }

    async function sharing() {
        console.log("Broadcast: ", Id)
        // puts this into the address bar
        let link = Id.to_location_hash()
        // QR code, copyable link?
    }
</script>

<button onclick={sharing} >share</button>