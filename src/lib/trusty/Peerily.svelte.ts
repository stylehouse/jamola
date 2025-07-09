
import type { Socket } from "socket.io";
import { io } from "socket.io-client";
import { _D, erring } from "$lib/Y";
import { Idento } from "./Peer.svelte";
import type { storableIdento } from "./Peer.svelte";

type TheStash = {
    Id: storableIdento,
    trust: {},
}
export class Peerily {
    socket:Socket
    awaits_socket:Array<Function> = []
    stash:TheStash = $state({})
    Id:Idento = new Idento()
    constructor(opt={}) {
        Object.assign(this, opt)
    }
    begin() {
        this.setupSocket()
    }
    setupSocket() {
        this.socket = io();
        this.socket.on('hi', async () => {
            this.listen_pubkey(this.Id)
            this.awaits_socket.map(y => y())
            this.awaits_socket = []
        });
        this.socket.on('pub', async (data) => {
            // go to the unemit
            console.log(`pub`,data)
        });
    }
    // own pubkey location
    // < by proving you own it
    async listen_pubkey(pub) {
        await this.wantsock()
        if (pub instanceof Idento) pub = pub.pretty_pubkey()
        this.socket.emit("sub",{pub})
        console.log(`listen_pubkey(${pub})`)
    }
    // < create a Peer, one at each end per peer?
    async connect_pubkey(pub) {
        await this.wantsock()
        if (pub instanceof Idento) pub = pub.pretty_pubkey()
        this.socket.emit("pub",{pub,data:{Connect:"tome"}})
        console.log(`connect_pubkey(${pub})`)
    }

    // await for socket to be connected
    async wantsock() {
        if (this.socket.connected) return
        return new Promise((resolve) => {
            this.awaits_socket.push(resolve)
        })
    }
}

