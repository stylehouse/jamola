import { parRecorder } from "$lib/recording"
import type { Party } from "./Party.svelte"
import type { Paring } from "./Peering.svelte"
import { AudioEffectoid, CookedStream, FreshStream, Gainorator, Gaintrol } from "$lib/audio.svelte"
import { userAgent } from "$lib/Y"


export class Participant {
    party:Party
    // peering gives us:
    ing:Paring
    // < removing this
    peerId:string
    // < GOING? now on par.ing.pc
    pc:RTCPeerConnection

    // coms
    name = $state()
    local?:true|null
    //  about the datachannel closing
    offline = $state()
    // webrtc
    constate = $state()
    // Call
    effects:Array<AudioEffectoid> = $state()
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
    emit(type,data) {
        return this.ing.emit(type,data)
    }
    get peerId() {
        return this.ing?.peerId ?? "???"
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

    
    // < GOING Peering handles pc now
    // old par, new pc!?
    new_pc_again(pc) {
        // stream|par.pc changes, same par|peerId
        //  peerId comes from socket.io, is per their websocket
        console.warn(`i_par: stream changes, same peer: ${this}`)
        debugger
        return
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
        this.configure_effects()

        this.party.measuring.add_par(this);
        
        if (this.wants_recording()) {
            // they record (.start()) when a track arrives
            this.recorder = new parRecorder({
                par: this,
                ...this.party.stuff_we_tell_parRecorder(),
            })
        }
    }
    // disarm anything thaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaat makes sound
    //  the above typo was ubbbbbbbbbbbbbbbbbbbuntu laggin
    drop_effects() {
        this.effects?.map(fec => fec.destroy())
        // < this seems to not do the trick?
        //delete this.effects
        this.effects = undefined
    }


    test_track? = $state()
    test_stream? = $state()
    onTrack(stream:MediaStream) {
        // before-effects debug probable
        // this.test_track = stream.getAudioTracks()[0];
        // this.test_stream = new MediaStream([this.test_track]);
        this.fresh.input(stream)

        // < party.get_forever('silent_audio_trick')
        //    allow the user to switch it on in audio debug ui
        let silent_audio_trick = userAgent() == 'Chrome'
        if (silent_audio_trick) {
            this.keep_silent_audio_trick(stream)
        }
    }
    keeper_audio?:HTMLAudioElement
    keep_silent_audio_trick(stream:MediaStream) {
        // Create a silent audio element to please Chrome
        if (!this.keeper_audio) {
            this.keeper_audio = new Audio();
            this.keeper_audio.volume = 0; // Silent
            this.keeper_audio.onplay = async () => {
                throw "Why is keeper_audio playing!>?"
            }
        }
        this.keeper_audio.srcObject = stream;
    }
    // < various suites of effects we could create
    //   nothing should assume even par.gain will be there
    //   low-power mode: par.fresh==par.cooked
    //   deaf-to-self mode: as opposed to just local gain=0
    //   a text area to compose systems of a dozen classes
    //   config -> configs (-> setlist)
    //    this + more stuff... about a dozen classes
    //     but arrangeable
    //   and wanting to sync them to git...
    //   the server has audio objects we can know about, too
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
        },6600)
    }
    configure_effects() {
        this.effects?.map(fec => {
            fec.controls?.map(con => {
                con.read_config()
            })
        })
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
