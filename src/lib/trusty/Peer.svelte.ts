import * as ed from '@noble/ed25519';

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
type storableIdento = {pub:string,key:string}
export class Idento extends IdentoCrypto {
    // url bit with a pubkey
    from_location_hash() {
        let m = window.location.hash.match(/^#(\w+)$/);
        if (!m) return
        let hex = m[1]
        if (hex.length == 16) this.advert = true
        this.publicKey = dehex(hex)
        if (!this.publicKey) {
            console.warn("Malformed public key?",mex)
        }
    }
    to_location_hash({short}) {
        window.location.hash = this.pretty_pubkey()
        return window.location.toString()
    }
    // when we only have the pretty part of the pubkey
    //  we can't verify signatures but can find out the longer pubkey
    advert = false
    pretty_pubkey() {
        return enhex(this.publicKey).slice(0,16)
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

export class Participant {
    peerId:string
    name:string|undefined = $state()

    constructor(opt) {
        Object.assign(this, opt)
    }
}
//#endregion