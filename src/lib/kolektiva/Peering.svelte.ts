
import { SignalingClient } from "$lib/ws-client.svelte";
import { tick } from "svelte";
import type { Party } from "./Party.svelte";

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

                    if ('want broken') {
                        // doesn't createDataChannel() fast enough, causes renegotiation
                        this.couldbeready(par)
                    }
                    else {
                        // throw datachannel out there now, so it can be part of the first negotiation
                        this.createDataChannel(par)
                    }
                },
                on_reneg: ({ peerId, pc }) => {
                    // hack for the renegotiation as a new pc, but same par
                    let par = this.party.i_par({ peerId })
                    console.warn(`~~~~~~~~~~~~~ reneg ${par} - ${par.constate}`)
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
        if (!par.channel) {
            // see 'want broken'
            this.createDataChannel(par)
            return
        }
        console.log(`${par} couldbeready...`)
        if (par.name != null) {
            // their channel delivers to us their name!
            // this is ready!
            // and our par.effects will be created with fully name
            par.on_ready()
            // we can send tracks
            this.lets_send_our_track(par)
            // we can receive tracks
            this.open_ontrack(par)
        }
    }








    // we wait to accept tracks
    //  race between our par.effects building after par.name
    //   and their track arriving here after they get our par.name
    // < because crypto trust
    open_ontrack(par) {
        console.log(`${par} open_ontrack!`)
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
    lets_send_our_track(par) {
        console.log(`${par} lets_send_our_track!`)
        if (!this.is_par_pc_ready(par)) {
            debugger
            return
        }
        let localStream:MediaStream = this.party.get_localStream?.()
        if (!localStream) throw "!localStream"
        
        let already_id = (id) => par.outgoing.filter(tr => tr.id == id)[0]

        localStream.getTracks().forEach((track:MediaStreamTrack) => {
            if (par.outgoing.includes(track)) {
                if (!already_id(track.id)) {
                    debugger; throw "pos-ob neg-id"
                }
                return
            }
            if (already_id(track.id)) {
                debugger; throw "ne-ob pos-id"
            }
            try {
                const sender = par.pc.addTrack(track, localStream);
                this.party.on_addTrack?.(par,track,sender,localStream)
                par.outgoing.push(track)
                console.log(`${par} give_localStream...`,{track,localStream,sender})
            } catch (error) {
                console.error("Failed to add track:", error);
            }
        });
    }
























    
    
    is_par_pc_ready(par) {
        return [
            // < this may not be true any more:
            // if we don't accept 'new' initially they never get there...
            "new",
            "connected",
            "connecting"
        ].includes(par.pc.connectionState)
        &&
        [
            "stable",
            // 'have-local-offer'
        ].includes(par.pc.signalingState)
}
    // the newbie phase of a new par.pc
    //  before the rest of the Participant lifetime
    // wait for par.pc to get in a good state
    //  and forever copy it to par.constate
    stabilise_par_pc(par) {
        // this falls down with the network?
        let says = [
            par.pc.connectionState,
            par.pc.signalingState,
            // PeerJS does pc.close() if this is failed|closed ...
            par.pc.iceConnectionState,
            par.channel?.readyState ?? "?",
        ].join('/')
        par.constate = says;

        // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState
        
        par.pc_ready = this.is_par_pc_ready(par)
        
        console.log(`-o- ${par}.pc is ${par.constate}`)
        
        // call this any time we could breakthrough
        this.couldbeready(par)
    }

    pc_handlers(par) {
        // until this stabilises:
        par.pc.oniceconnectionstatechange =
        par.pc.onconnectionstatechange =
        par.pc.onsignalingstatechange = () => {
            this.stabilise_par_pc(par)
        }
        // which leads us (both ends) to createDataChannel(par)
        //  so get our receiver ready now:
        par.pc.ondatachannel = ({channel}) => {
            this.incomingDataChannel(par,channel)
        };
        // take audio to effects, in a moment
        par.pc.ontrack = (e) => {
            console.log(`${par} par.pc.ontrack into the queue`);
            (par.ontrack_queue ||= []).push(e)
        };
        // the agent of an ontrack event is an addTrack at the other end
    }











    
    // there are two data channels
    //  because there's no singularity deciding who gets to create one
    //   < track who originated the offer? it kind of gets lost in the mail
    //  both pc just arrive in the right state to be able to
    // the receiver is this other channel they sent us
    // put handlers of replies in par_msg_handler.$type
    incomingDataChannel(par,channel) {
        par.their_channel = channel
        // console.log(`theirData arrives: ${par}`);
        par.their_channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // console.log(`theirData message: ${par}`,data);
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
            // console.log(`theirData open: ${par}`);
        };
        par.their_channel.onclose = () => {
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
        par.channel.onclose = async () => {
            par.offline = 1;
            delete par.bitrate;
            console.log(`Data Leaves: ${par}`);
            delete par.channel
            // wait for possible par.pc_ready=false when par.pc.close()ing
            await tick()
            // < the above isn't enough
            // we must ensure we check par.pc.connectionstatus -> par.pc_ready
            //  before trying to rebuild par.channel
            this.stabilise_par_pc(par)
        };
    }

}
















