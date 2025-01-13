import { Peering } from "$lib/kolektiva/Peering.svelte"
import { SvelteMap } from "svelte/reactivity"
import { Participant } from "./Participants.svelte"
import type { Socket } from "socket.io"
import type { Measuring } from "$lib/measuring.svelte"
import { throttle } from "$lib/Y"










//#region GoodTime
class GoodTime {
    // some settings can come from the user's stored config:
    // whether to Ring on pageload:
    was_on = $state(false)
    // stored:
    activate_recording = $state(false)
    // not ui'd, records our local stream
    activate_recording_for_peerIds = [""]
    // stored:
    forever = $state({})

    party_storables = ['was_on', 'activate_recording','forever']
    localStorageConfigKey = 'jamola_config_v1'

    load_config() {
        if (!localStorage.jamola_config_v1) return
        // put config items where they go, mostly on party?
        // < why are enclosing () are required..?
        let s = localStorage[this.localStorageConfigKey]
        console.log("Loading config!", s);
        let config = JSON.parse(s)
        this.party_storables.map(k => {
            if (config[k] != null) {
                // put them in party, from config
                this[k] = config[k]
            }
        })
        console.log("loaded was_on: "+this.was_on)

    }
    save_config(dont_save=false) {
        this.store_config ||= throttle((config) => {
            if (!config) return
            let s = JSON.stringify(config);
            console.log("Storing config!", s);
            localStorage[this.localStorageConfigKey] = s
        }, 200);

        let config = {}
        this.party_storables.map(k => {
            if (this[k] != null) {
                // put them in config, from party
                config[k] = this[k]
            }
        })
        if (dont_save) {
            // just picking up reactive variables the first time
            return
        }
        console.log("Could be storing config...")
        this.store_config(config)
        console.log("saved was_on: "+config.was_on)

    }
}
























//#region Party
export class Party extends GoodTime {
    peering:Peering
    socket:Socket
    // < rename ers or people. it's VR so...
    participants:Map<peerId, Participant> = $state(new SvelteMap())
    measuring:Measuring

    userName:string
    // sendable tracks in a stream
    get_localStream?:Function
    on_addTrack?:Function

    // got by the first AudioEffectoid using audioContext
    // < Party etc shouldn't happen server-side at all? lots of *.svelte to be done
    //   subscribing to changes in Party.* or Participant.effect.*.*
    //    to storage...
    audioContext
    // checked when the above is first got
    wants_audio_permission?:Function

    constructor() {
        super()
    }

    singularise() {
        let was = window.party_singleton 
        if (was) was.stop()
        window.party_singleton = this
    }
    start() {
        this.peering?.stop()
        this.peering = new Peering({
            party: this,
            onPeerReady: (ing) => {
                console.log(`onPeerReady: ${ing}`)
            }
        })
    }

    stop() {
        // stop all peer connections
        // the definitely-immediate part of Peering.stop()
        this.peering?.stop_ings()
        // this may wait a little longer for audio-upload via websocket to finish
        let let_go = () => {
            this.peering?.stop()
        }

        this.map(par => {
            par.local || par.drop_effects()

            if (par.recorder) {
                par.recorder.stop(let_go)
                let_go = () => {}
            }
        });

        let_go()
    }


    // culture clings to party.forever.*
    make_forever_key(key: string | Array<any>): string {
        if (typeof key === 'string') return key;
        if (!Array.isArray(key)) {
            console.error('Invalid forever key type:', typeof key);
            return String(key);
        }
        return key.map(k => {
            if (typeof k === 'string') return k;
            if (k?.name != null) return String(k.name);
            console.warn('Unexpected forever key component:', k);
            return String(k);
        }).join('/');
    }
    set_forever(key:Array,value) {
        key = this.make_forever_key(key)
        this.forever[key] = value
        console.log("forever: set for "+key+"\t"+value)
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
        return this.participants.forEach(y)
    }
    // all par that represent other jamola instances, eg for sending titles
    everyone(y:Function) {
        return this.participants.forEach((par) => {
            if (par.local) return
            y(par)
        })
    }
    repar(par) {
        return this.find_par({par})
    }
    // read a participant (by peerId or par)
    find_par(c):Participant {
        let { par, peerId } = c
        if (par && peerId == null) {
            // for par = repar(par)
            //  see "it seems like a svelte5 object proxy problem"
            peerId = par.peerId
        }
        par = this.participants.get(peerId)
        return par
    }

    createPar(c) {
        const par = new Participant({ party: this, ...c })
        this.participants.set(par.peerId,par);
        return par
    }
}

