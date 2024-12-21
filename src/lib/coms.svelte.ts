
import { SignalingClient } from "$lib/ws-client.svelte";
import type { Party } from "./kolektiva/Party.svelte";

// front ws-client, do par coming-going
//  not for par that are par.local of course.
export class Peering {
    // < this as our only form of security
    //  < push button invite par to a new room
    room = 'The Jam Space'
    party: Party
    Signaling: SignalingClient
    constructor(opt) {
        Object.assign(this, opt)
        this.room = this.party.get_forever("room")
    }
    start() {
        // < this could async through the whole start() process
        let part = 'Signaling'
        try {
            this.Signaling = new SignalingClient({
                on_peer: ({ peerId, pc }) => {
                    part = 'on_peer'
                    // a peer connection
                    //  soon to receive tracks, name etc
                    let par = this.party.i_par({ peerId, pc });
                    // but first:
                    this.pc_handlers(par)
                    // which leads to couldbeready(par) to graduate to tracksable.
                },
            });
        } catch (error) {
            throw `Error in ${part}: ${error.message}`;
        }
    }
    stop() {
        console.log("Peering stop()")
        this.Signaling.close()
    }

    pc_handlers(par) {
        // until this stabilises:
        par.pc.onconnectionstatechange =
        par.pc.onsignalingstatechange = () => {
            this.stabilise_par_pc(par)
        }

        // which leads us (both ends) to createDataChannel(par)
        //  so get the receiver ready now:
        // and this should be ready very soon after that so:
        par.pc.ondatachannel = ({channel}) => {
            debugger
            this.incomingDataChannel(par,channel)
        };

        // take audio to effects
        par.pc.ontrack = (e) => {
            console.log(`${par} par.pc.ontrack into the queue`)
            (par.ontrack_queue ||= []).push(e)
        };
        // the inverse of ontrack is addTrack, via:
    }
    lets_send_our_track(par) {
        console.log(`${par} lets_send_our_track!`)
        this.party.to_send_our_track(par)
    }

    // these are a low-level preamble to the lifetime of a par
    // overall:
    //  par.new_pc() occurs immediately, but only does pc measuring
    //  ...then there are these prosthetic steps below...
    //  par.on_ready() is the high-level, send|receive tracks time
    // anyway this fires any time we might have satisfied its rules
    couldbeready(par) {
        if (!par.pc_ready) {
            // wait for par.pc to get in a good state
            return
        }
        console.log(`${par} couldbeready...`)
        // < resolve a promise to advance the $part of start() we are up to
        //   but none of this other action (from on*change handlers)
        //    is via that try+catch, so...
        if (!par.channel) {
            // trigger channel creation
            setTimeout(() => {
            this.createDataChannel(par)
        },100)

            setTimeout(() => {
                this.lets_send_our_track(par)

                this.channel_emit_noise(par)

            },500)

            return
        }
        if (par.name != null) {
            // their channel delivers to us their name!
            // this is ready!
            // and our par.effects will be created with fully name
            console.log(`${this} par.on_ready!`)
            debugger
            par.on_ready()
            console.log(`${par} on_ready`)

            // we are now ready to receive tracks
            this.open_ontrack(par)
        }
        console.log(`${par} no name...`)
    }
    channel_emit_noise(par) {
        console.log(`Data noise to ${par}`)
        par.emit("gabora","swim")
    }
    
    // we wait to accept tracks
    //  race between our par.effects building after par.name
    //   and their track arriving here after they get our par.name
    // < because crypto trust
    open_ontrack(par) {
        // < multiple tracks, one at a time?
        par.pc.ontrack = (e) => {
            console.log(`${par} par.pc.ontrack`)
            par.fresh.input(e.streams[0])
        };
        (par.ontrack_queue||[]).map(e => {
            console.log(`${par} par.pc.ontrack from queue:`)
            par.pc.ontrack(e)
        })
        delete par.ontrack_queue
    }
    

    // the newbie phase of a new par.pc
    //  before the rest of the Participant lifetime
    // wait for par.pc to get in a good state
    //  and forever copy it to par.constate
    stabilise_par_pc(par) {
        // this falls down with the network?
        let says = par.pc.connectionState + "/" + par.pc.signalingState;
        par.constate = says;

        // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState
        
        par.pc_ready =
            [
                // if we don't accept 'new' initially they never get there...
                "new",
                "connected",
                // ,'connecting'
            ].includes(par.pc.connectionState)
            &&
            [
                "stable",
                // 'have-local-offer'
            ].includes(par.pc.signalingState)
        
        // call this any time we could breakthrough
        par.pc_ready
            && this.couldbeready(par)
    }

    // the receiver is this other channel they sent us
    // put handlers of replies in par_msg_handler.$type
    incomingDataChannel(par,channel) {
        par.their_channel = channel
        console.log(`theirData arrives: ${par}`);
        par.their_channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log(`theirData message: ${par}`,data);
            let handler = par.party.par_msg_handler[data.type]
            if (!handler) {
                return console.warn(`No handler for par=${par.name} message: `,data)
            }
            // < for some reason we have to seek out the par again at this point
            //   not doing this leads to this.par.name being undefined
            //    much later in parRecorder.uploadCurrentSegment
            //    see "it seems like a svelte5 object proxy problem"
            par = par.party.repar(par)

            handler(par,data)
        };

        par.their_channel.onerror = (e) => {
            console.log(`theirData error: ${par}`,e);
        };
        par.their_channel.onopen = () => {
            delete par.offline;
            announce_self();
            console.log(`theirData open: ${par}`);
        };
        par.their_channel.onclose = () => {
            par.offline = 1;
            delete par.bitrate;
            console.log(`theirData Leaves: ${par}`);
        };
    }
    createDataChannel(par) {
        let original = par.channel
        par.channel = par.pc.createDataChannel("participants");
    
        // you (eg Measuring) can send messages.
        // like socket.io
        par.emit = (type,data) => {
            if (!par.channel || par.channel.readyState != "open") {
                return console.error(`channel ${par} not open yet`)
            }
            par.channel.send(JSON.stringify({type,...data}))
        }
        let announce_self = () => {
            console.log(`${par} announce_self`)

            par.emit("participant",{name:par.party.userName})
            // once
            announce_self = () => {};
        };
        if (par.channel.readyState == "open") {
            debugger;
            announce_self();
        }
        console.log(`${par} createDataChannel`,par.channel)


        par.channel.onerror = (e) => {
            console.log(`Data error: ${par}`,e);
        };
        par.channel.onmessage = (e) => {
            console.log(`Data message (on the out channel): ${par}`,e);
        };
        par.channel.onopen = () => {
            delete par.offline;
            announce_self();
            console.log(`Data open: ${par}`);
        };
        par.channel.onclose = () => {
            par.offline = 1;
            delete par.bitrate;
            console.log(`Data Leaves: ${par}`);
        };
    }

}


















// participants exchange names in a webrtc datachannel
// one is attached to the par:
export function createDataChannel({par,par_msg_handler,userName}) {
    let original = !par.channel
    par.channel ||= par.pc.createDataChannel("participants");

    // you (eg Measuring) can send messages.
    // like socket.io
    par.emit = (type,data) => {
        if (!par.channel || par.channel.readyState != "open") {
            return
        }
        par.channel.send(JSON.stringify({type,...data}))
    }
    // the receiver is this other channel they sent us
    // put handlers of replies in par_msg_handler.$type
    par.pc.ondatachannel = ({channel}) => {
        par.their_channel = channel
        par.their_channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            let handler = par_msg_handler[data.type]
            if (!handler) {
                return console.warn(`No handler for par=${par.name} message: `,data)
            }
            // < for some reason we have to seek out the par again at this point
            //   not doing this leads to this.par.name being undefined
            //    much later in parRecorder.uploadCurrentSegment
            //    see "it seems like a svelte5 object proxy problem"
            par = par.party.repar(par)

            handler(par,data)
        };
    };
    let announce_self = () => {
        par.emit("participant",{name:userName})
        // once
        announce_self = () => {};
    };
    if (par.channel.readyState === "open") {
        debugger;
        announce_self();
    }

    par.channel.onopen = () => {
        delete par.offline;
        announce_self();
        // console.log(`Data open: ${par.peerId}`);
    };
    par.channel.onclose = () => {
        par.offline = 1;
        delete par.bitrate;
        console.log(`Leaves: ${par.name}`);
    };
}