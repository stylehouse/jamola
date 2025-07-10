
import { _D, erring } from "$lib/Y";
import { Idento, Pier } from "./Peer.svelte";
import type { storableIdento } from "./Peer.svelte";
import Peer from 'peerjs'

type TheStash = {
    Id: storableIdento,
    trust: {},
}
type pubid = string
export function bunch_of_nowish() {
    let seconds = Math.floor(Date.now() / 1000)
    let t = Math.floor(seconds / 5) * 5
    return [t,t-5,t+5,t-10,t+10]

}
export class Peerily {
    stash:TheStash = $state({})
    Id:Idento = new Idento()
    eer:Peer
    peers_by_pub = {}
    constructor(opt={}) {
        Object.assign(this, opt)
    }
    // own pubkey location
    // < by proving you own it
    async listen_pubkey(pub) {
        pub = ''+pub
        if (!pub) throw "!pub"
        this.eer = new Peer(pub)
        console.log(`listen_pubkey(${pub})`)
        this.eer.on('connection', (con) => {
            console.log(`<- connection(${pub})`,con)
            this.a_pier(con.peer).init(con)
        })
    }
    async connect_pubkey(pub) {
        pub = ''+pub
        let con = this.eer.connect(pub)
        if (!con) {
            throw "OHNO"
        }
        con.on('open', () => {
            if (con.peer != pub) debugger
            console.log(`-> connection(${pub})`,con)
            this.a_pier(pub).init(con)
                // someone has to try con.send() to get it open
                .say_hello()
        });
        console.log(`connect_pubkey(${pub})`)
    }
    a_pier(pub):Pier {
        if (!pub) throw "!pub"
        pub = ''+pub
        let pier = this.peers_by_pub[pub]
        if (!pier) {
            pier = this.peers_by_pub[pub] = new Pier({P:this,pub})
        }
        return pier
    }
}

