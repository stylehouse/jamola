import { CookedStream, FreshStream, Gainorator, Gaintrol } from "$lib/audio.svelte"
import { parRecorder } from "$lib/recording"


export class Participant {
    // peering gives us:
    peerId:string
    pc?:RTCPeerConnection

    // coms
    name = $state()
    //  about the datachannel closing
    offline = $state()
    // webrtc
    constate = $state()
    // Call
    effects = $state()
    // < tis messy just throwing these on here, but we want them by name sometimes
    // sometimes want to access effects by name
    fresh?:CookedStream
    // this one triggers the Participant/Rack.svelte to appear
    gain:Gainorator = $state()
    cooked?:CookedStream
    vol?:Gaintrol
    // incoming tracks from Peering while setting up
    ontrack_queue
    // measuring
    bitrate = $state()
    latency = $state()
    

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

    // i_par calls one of these when a new pc arrives
    // < what to do with the old one..?

    // a new par, a new pc
    new_pc() {
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
        console.log(`i_par: stream changes, same peer: ${this}`)
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

    // pc, datachannel and name are ready!
    // or it is par.local, which is ready immediately
    // after this something will par.fresh.input()
    //  for local it's i_myself_par(), otherwise open_ontrack()
    on_ready() {
        console.log(`par.on_ready: ${this}`)
        this.effects && this.drop_effects()
        this.new_effects()
    }
    // disarm anything thaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaat makes sound
    //  the above typo was ubbbbbbbbbbbbbbbbbbbuntu laggin
    drop_effects() {
        this.effects?.map(fec => fec.destroy())
        // < this seems to not do the trick?
        //delete this.effects
        this.effects = undefined
    }



    // < how to reiterate this function, esp the very inner...
    //   transact par.effects?
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

        this.shouldHaveTrackTimeoutId
            && clearTimeout(this.shouldHaveTrackTimeoutId)
        this.shouldHaveTrackTimeoutId = setTimeout(() => {
            if (par.cooked.output) return
            // should have it by now
            console.error(`should have ${this} stream by now`)
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
