import { CookedStream, FreshStream } from "$lib/audio.svelte"
import { parRecorder } from "$lib/recording"

export class Party {
    participants = $state([])
    measuring:Measuring

    // some settings can come from the user's stored config:
    activate_recording = $state(false)
    activate_recording_for_peerIds = [""]

    constructor() {
    }
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
export class Participant {

    // <
    // streams from them
    incoming = $state([])
    // streams from us
    outgoing = $state([])

    constructor(opt) {
        Object.assign(this, opt);
    }
    toString() {
        return this.name || this.peerId
    }

    wants_recording() {
        if (this.party.activate_recording
            && (!this.party.activate_recording_for_peerIds
                || this.party.activate_recording_for_peerIds.includes(this.peerId))) {
            return true
        }
    }


    // a new par, a new pc
    new_pc() {
        // < the par.audio should probably become a feed to audioContext
        // < does this mean each participant becomes an output stream from the browser?
        this.audioContext = window.an_audioContext ||= new AudioContext()
        
        this.new_effects()

        this.party.measuring.add_par(this);
        if (this.wants_recording()) {
            // they record (.start()) when a track arrives
            this.recorder = new parRecorder({par:this,...this.party.stuff_we_tell_parRecorder()})
        }
    }
    // old par, new pc!?
    new_pc_again(pc) {
        // stream|par.pc changes, same par|peerId
        //  peerId comes from socket.io, is per their websocket
        console.log(`i_par: stream changes, same peer: ${this.name}`)
        // hangup, change userName, Ring again causes this branch as you re-connect to each par
        // bitratestats will notice this change itself
        if (this.pc == pc) debugger;
        // Stop existing recording if we're replacing the connection
        //  it needs to be started again on a new MediaStream
        // < will it?
        if (this.recorder) {
            this.recorder.stop();
        }
        this.pc?.close && this.pc?.close();
        this.pc = pc;
    }
    new_effects() {
        let par = this
        // some stream will be given to:
        par.fresh = new FreshStream({par})

        // everything that matters in the middle here is in Call.svelte for visibility
        this.party.setup_par_effects(this)

        par.cooked = new CookedStream({par})
        // the last effect has nowhere to flow on to
        par.cooked.on_output = (stream) => {
            this.have_output(stream)
        }

        setTimeout(() => {
            if (par.cooked.output) return
            // should have it by now
            throw `should have ${this} stream by now`
        },2500)
    }

    have_output(stream) {
        if (!this.cooked.output) {
            debugger
        }
        // now output via webaudio from the last (this) effect, not an <audio>
        this.may_record()
    }

    // the one place to start recordings
    // occurs two ways:
    //  usually, streams arriving cause a par.cooked.on_output()
    //  the local stream only "arrives" and causes that once though
    //   so we also do this in i_myself_par(), as we reconnect (reRing)
    // < we should be able to record audio without a connection! an offline webapp.
    may_record() {
        if (!this.recorder) return
        if (!this.cooked.output) return console.log("No cooked output")
        if (this.recorder.is_rolling()) return
        // < take the recording just after this.gain and this.delay
        //    but before this.reverb|echo and the messier|refinable effects
        //    and apply|refine the later effects on listen...
        //     ie in post ie post-production, which can mean any treatment not live
        //    since it's better to record clear audio
        //     and make it into a reverb cloud after decoded
        this.recorder.start(this.cooked.output);
    }
}

export type aParticipant = {
    peerId:string,
    pc?:RTCPeerConnection,
    name?:string,
    fresh?:CookedStream,
    gain?:Gainorator,
    cooked?:CookedStream,
    audio:HTMLAudioElement
}