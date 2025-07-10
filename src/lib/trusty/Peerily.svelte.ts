
import type { Socket } from "socket.io";
import { io } from "socket.io-client";
import { _D, erring } from "$lib/Y";
import { Idento, Pier } from "./Peer.svelte";
import type { storableIdento } from "./Peer.svelte";

type TheStash = {
    Id: storableIdento,
    trust: {},
}
type pubid = string
export class Peerily {
    socket:Socket
    awaits_socket:Array<Function> = []
    stash:TheStash = $state({})
    Id:Idento = new Idento()
    peers_by_pub = {}
    constructor(opt={}) {
        Object.assign(this, opt)
    }
    begin() {
        this.setupSocket()
    }
    setupSocket() {
        this.socket = io();
        this.socket.on('hi', async () => {
            this.Id.publicKey && this.listen_pubkey(this.Id)
            this.awaits_socket.map(y => y())
            this.awaits_socket = []
        });
        this.socket.on('pub', async (data) => {
            // go to the unemit
            console.log(`pub`,data)
            this.unemit(data)
        });
    }
    // own pubkey location
    // < by proving you own it
    async listen_pubkey(pub) {
        await this.wantsock()
        pub = ''+pub
        if (!pub) throw "!pub"
        console.log(`listen_pubkey(${pub})`)
        this.socket.emit("sub",{pub})
    }
    // < create a Peer, one at each end per peer?
    async connect_pubkey(pub) {
        await this.wantsock()
        pub = ''+pub
        console.log(`connect_pubkey(${pub})`)
        this.a_pier(pub).emit('connectable')
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

    // await for socket to be connected
    async wantsock() {
        if (this.socket.connected) return
        return new Promise((resolve) => {
            this.awaits_socket.push(resolve)
        })
    }

    emit(pier,type,data={},options={}) {
        // put in type
        // < binary mode
        data = {type, ...data}
        // become only about data going somewhere
        // < sign from here
        let msg = {
            pub: pier.pub,
            from: this.Id.pretty_pubkey(),
            data
        }
        this.socket.emit('pub',msg)
    }
    unemit(msg) {
        // < verify it's from there, etc
        let data = msg.data
        let pier = this.peers_by_pub[msg.from]
        if (!pier) {
            if (data.type == 'connectable') {
                pier = this.a_pier(msg.from)
            }
            else {
                throw "not our pier"
            }
        }
        // < check this is someone cleared to manipulate us this way
        this.handleMessage(pier,data)
    }
    handleMessage(pier:Pier,data) {
        const handler = this.handlers[data.type]
        if (!handler) {
            return console.warn(`${this} channel !handler for message type:`, data);
        }
        handler(pier, data);
    }

    handlers = {
        connectable: (pier,data) => {
            console.log("Make them")
        }
    }
}

