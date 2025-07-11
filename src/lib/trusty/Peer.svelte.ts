import * as ed from '@noble/ed25519';
import type { DataConnection } from 'peerjs';

type prepub = string
//#region crypto
// Export keys to hexadecimal
export const enhex = ed.etc.bytesToHex
export const dehex = ed.etc.hexToBytes
// ensure Uint8Array (Bytes)
function enu8(message) {
    return message instanceof Uint8Array ? 
        message : new TextEncoder().encode(message)
}

// the crypto features of Idento
export class IdentoCrypto {
    public publicKey:ed.Bytes = $state()
    public privateKey:ed.Bytes = $state()

    async generateKeys() {
        const privateKey = ed.utils.randomPrivateKey()
        const publicKey = await ed.getPublicKeyAsync(privateKey)

        this.replaceKeys({ publicKey, privateKey })
    }
    // changes the identity of this Idento
    //  when you become the streamer, etc.
    replaceKeys({ publicKey, privateKey }) {
        Object.assign(this, { publicKey, privateKey })
    }

    async sign(message) {
        if (!this.privateKey) throw "!privateKey"
        const signature = await ed.signAsync(enu8(message),this.privateKey)
        return signature
    }

    async verify(signature, message) {
        if (!this.publicKey) throw "!publicKey"
        let verified = await ed.verifyAsync(signature,enu8(message),this.publicKey)
        return verified
    }

    get pub():ed.Hex {
        if (!this.publicKey) return ''
        return enhex(this.publicKey)
    }
}


//#endregion
//#region idento
// lifecycle-related helpers
export type storableIdento = {pub:string,key:string}
export class Idento extends IdentoCrypto {
    // url bit with a pubkey
    from_location_hash() {
        let m = window.location.hash.match(/^#(\w+)$/);
        if (!m) return
        let hex = m[1]
        if (hex.length == 16) this.advert = true
        this.publicKey = dehex(hex)
        if (!this.publicKey) {
            console.warn("Malformed public key?",hex)
        }
    }
    to_location_hash() {
        window.location.hash = this.pretty_pubkey()
        return window.location.toString()
    }
    // when we only have the pretty part of the pubkey
    //  we can't verify signatures but can find out the longer pubkey
    advert = false
    pretty_pubkey():prepub {
        return enhex(this.publicKey).slice(0,16)
    }
    toString() {
        return this.pretty_pubkey()
    }

    thaw(a:storableIdento) {
        this.publicKey = dehex(a.pub)
        if (a.key) this.privateKey = dehex(a.key)
    }
    freeze() {
        let a:storableIdento = {}
        a.pub = enhex(this.publicKey)
        if (this.privateKey) a.key = enhex(this.privateKey)
        return a
    }
}
//#endregion
//#region Room

// aka Participant
export class Pier {
    P:Peerily
    pub:prepub|null // if we want to find that full pretty_pubkey()
    con:DataConnection


    constructor(opt) {
        Object.assign(this, opt)
    }
    init(con) {
        this.con = con
        // Receive messages
        this.con.on('data', (msg) => {
            this.unemit(msg)
        });
        return this
    }
    said_hello = false
    say_hello() {
        if (this.said_hello) return true
        // give them our entire pubkey
        // < sign a recent timestamp
        this.emit('hello',{publicKey:enhex(this.P.Id.publicKey)})
        this.said_hello = true
    }

    emit(type,data={},options={}) {
        // put in type
        // < binary mode
        data = {type, ...data}
        // become only about data going somewhere
        // < sign from here (another JSON.stringify() at each end?)
        if (!this.pub) throw "!Pier.pub"
        let msg = {
            to: this.pub,
            from: this.P.Id.pretty_pubkey(),
            sig: "yes",
            data
        }
        this.con.send(msg)
    }
    unemit(msg) {
        let data = msg.data
        // < check permit
        this.handleMessage(data,msg)
    }
    handleMessage(data) {
        const handler = this.handlers[data.type]
        if (!handler) {
            return console.warn(`${this} channel !handler for message type:`, data);
        }
        handler(data);
    }

    handlers = {
        hello: (data) => {
            console.log("they say hi: ",data)
            if (!this.said_hello) {
                this.say_hello()
            }
            else {
                this.emit('story',{yadda:3})
            }
        },
        story: (data) => {
            console.log("they say story: ",data)
            data.yadda++ < 9
                && this.emit('story',{yadda:data.yadda})
        },
    }
}
//#endregion