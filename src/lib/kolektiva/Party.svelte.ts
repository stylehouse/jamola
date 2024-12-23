import { Peering } from "$lib/coms.svelte"
import { Participant } from "./Participants.svelte"

export class Party {
    peering
    participants = $state([])
    measuring:Measuring

    userName

    // is not server-side so create this in new_pc when we need it
    // < Party etc shouldn't happen server-side at all? lots of *.svelte to be done
    //   subscribing to changes in Party.* or Participant.effect.*.*
    //    to storage...
    audioContext

    // some settings can come from the user's stored config:
    // stored:
    activate_recording = $state(false)
    activate_recording_for_peerIds = [""]
    // stored:
    forever = $state({})

    constructor() {
    }

    singularise() {
        let was = window.party_singleton 
        if (was) was.stop()
        window.party_singleton = this
    }
    start() {
        this.peering && this.stop()
        this.peering = new Peering({party:this})
        this.peering.start()
    }

    stop() {
        // waylay closing the socket for any final audio-upload
        let let_go = () => {
            this.peering?.stop()
        }

        this.participants.map(par => {
            par.pc?.close && par.pc?.close();

            par.local || par.drop_effects()

            if (par.recorder) {
                par.recorder.stop(let_go)
                let_go = () => {}
            }
        });

        let_go()
    }


    // culture clings to party.forever.*
    make_forever_key(key) {
        if (typeof key == 'string') return key
        return key.map(k => {
            if (k.name?.length) return k.name
            if (k.name != null) return k.name
            if (typeof k == 'string') return k
            debugger
        }).join('/')
    }
    set_forever(key:Array,value) {
        key = this.make_forever_key(key)
        this.forever[key] = value
        console.log("forever: set for "+key)
    }
    // < this could give out defaults
    //   our loose function call to adjust gain to 0.7
    //     seems not to be happening
    get_forever(key:Array) {
        key = this.make_forever_key(key)
        let v = this.forever[key]
        console.log("forever: "+(v != null ? "Had a "  : "blank ")+" for "+key)
        return v
    }

    
    // 
    map(y:Function) {
        return this.participants.map(y)
    }
    repar(par) {
        return this.i_par({par})
    }
    // read or add new participant (par)
    i_par(c:Participant):aParticipant {
        let { par, peerId, pc, ...etc } = c
        
        if (par && peerId == null) {
            if (pc != null) throw 'pc'
            // to relocate a par. see "it seems like a svelte5 object proxy problem"
            peerId = par.peerId
        }
        par = this.participants.filter((par) => par.peerId == peerId)[0];
        // they know the room
        if (par && par.party && par.party != this) throw "teleported party"
        // bring a piece of it
        // < is there only one of these? when another?
        if (pc) {
            if (!par) {
                // new par
                par = new Participant({
                    party: this,
                    peerId,
                    pc,
                    i_par: this.i_par,
                })

                par.new_pc()

                this.participants.push(par);
            } else {
                par.new_pc_again(pc)
            }
        }
        else {
            if (!par) {
                // not found, and no peerconnection to create one around
                return
            } else {
                // found
            }

        }

        // you give them properties
        Object.assign(par, etc);

        return par;
    }




}