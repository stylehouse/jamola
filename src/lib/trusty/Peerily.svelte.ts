
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
        con.on('open', () => {
            if (con.peer != pub) debugger
            console.log(`-> connection(${pub})`,con)
            this.a_pier(pub).init(con)
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
        this.handleMessage(pier,data,msg)
    }
    handleMessage(pier:Pier,data) {
        const handler = this.handlers[data.type]
        if (!handler) {
            return console.warn(`${this} channel !handler for message type:`, data);
        }
        handler(pier, data);
    }

    handlers = {
        connectable: (pier,data,msg) => {
            console.log("Make them")
            pier.Peerify()
        }
    }
}

