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
        console.log("\t\tLoading config!", s);
        let config = JSON.parse(s)
        this.party_storables.map(k => {
            if (config[k] != null) {
                // put them in party, from config
                this[k] = config[k]
            }
        })

    }
    save_config(dont_save=false) {
        this.store_config ||= throttle((config) => {
            if (!config) return
            let s = JSON.stringify(config);
            console.log("\t\tStoring config!", s);
            localStorage[this.localStorageConfigKey] = s
        }, 200);

        let config = {}
        this.party_storables.map(k => {
            if (this[k] != null) {
                // put them in config, from party
                config[k] = this[k]
            }
        })
        config.forever = this.forever
        if (dont_save) {
            // just picking up reactive variables the first time
            return
        }
        this.store_config(config)

    }
}
























//#region Party
export class Party extends GoodTime {
    peering:Peering
    par_msg_handler:Record<string,Function>
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

    // to sometimes log your _D(name,...)
    //  set (name =~ /^(\w+)/)[0] to true in here:
    debugthe = {emit:1,unemit:1,notping:1}

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
            par.stop()
            // < tuck in more sensible
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
    // only let the config save at 2fps
    set_forever_throttle = throttle(() => {
        this.save_config()
    }, 500)
    set_forever(key:Array,value) {
        key = this.make_forever_key(key)
        this.forever[key] = value
        this.forever = this.forever
        this.set_forever_throttle()
        // console.log("forever: set for "+key+"\t"+value)
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


    recent_errors = $state([])
    global_error_handlers() {
        let party = this

        // Preserve original console.error
        window._originalConsoleError ||= console.error;
        // Track last error message to prevent doubles
        //  because we handle direct-to-console.error() in this list too
        //   errors propagate there after coming here
        window._lastErrorMsg = null;
        console.log("re global_error_handlers()")

        // Override console.error
        console.error = function(...args) {
            // Call original console.error
            window._originalConsoleError.apply(console, args);

            // Format the error message
            let msg = args.map(arg => {
                if (typeof arg === 'string') return arg;
                if (arg instanceof Error) return arg.message;
                try {
                    return JSON.stringify(arg);
                } catch {
                    return String(arg);
                }
            }).join(' ');
            // // Skip if this is the same message we just handled
            // let is = msg === window._lastErrorMsg ? 'IS' : '--'
            // console.log(`an error ${window._lastErrorMsg} \t\t\t ${is} \t\t\t ${msg}`)
            // if (msg === window._lastErrorMsg) {
            //     console.log(" =================== duplicate err ignored")
            //     window._lastErrorMsg = null;
            //     return;
            // }
            // Extract stack trace if available
            let error = args.find(arg => arg instanceof Error);
            let stack = error?.stack;

            party.recent_errors.push({
                now: Date.now(),
                via: "console",
                msg,
                stack,
                args  // Store original args for the log button
            });
        };

        window.onerror = function(msg, url, line, col, error) {
            // Clean up the error message
            let cleanMessage = msg;
            if (typeof msg === 'object') {
                cleanMessage = msg.type || 'Unknown Error';
            }
            
            // Format the error location if available
            let location = '';
            if (url) {
                let shortUrl = url.split('/').pop();
                let loc = line
                if (col) loc += ':'+col
                location = ` at ${loc} ${shortUrl}`;
            }
            // put on the page
            // < on the screen.
            //   some elements can vibrate
            //   stretch-float into the viewport for attention
            msg = `${cleanMessage}${location}`;
            window._lastErrorMsg = msg;
            
            party.recent_errors.push({
                now: Date.now(),
                via: "global",
                msg, url, line, col, error
            })
            return false; // Let the error propagate
        };
        // Also catch unhandled promise rejections
        window.onunhandledrejection = function(event) {
            let msg = event.reason?.message || event.reason || 'Promise rejected';
            window._lastErrorMsg = msg;
            party.recent_errors.push({
                now: Date.now(),
                via: "rejection",
                msg, reason: event.reason
            })
        };
    }
}
