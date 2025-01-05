
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
                on_peer_creation: ({pc,polite}) => {
                    // sync after new RTCPeerConnection
                    // Create data channel immediately
                    if (!polite) {
                        // Only the !polite peer creates the data channel
                        this.initDataChannel(pc);
                    }
                },
                on_peer: ({ peerId, pc, polite }) => {
                    part = 'on_peer'
                    // a peer connection
                    //  soon to receive tracks, name etc
                    let par = this.party.i_par({ peerId, pc });
                    // but first:
                    this.pc_handlers(par)
                    // which leads to couldbeready(par) to graduate to tracksable.

                    if (0 && 'want broken') {
                        // doesn't createDataChannel() fast enough, causes renegotiation
                        this.couldbeready(par)
                    }
                    else {
                        // throw datachannel out there now, so it can be part of the first negotiation
                        // this.createDataChannel(par)
                    }
                },
                on_reneg: ({ peerId, pc }) => {
                    // hack for the renegotiation as a new pc, but same par
                    let par = this.party.i_par({ peerId })
                    console.warn(`~~~~~~~~~~~~~ reneg ${par} - ${par.constate}`)
                    // < should we ever? would we rebuild them?
                    //    perhaps we should throw out the par?
                    // par.channel?.close()
                    // par.their_channel?.close()
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
            // this.createDataChannel(par)
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
        let had = par.ontrack_queue || []
        let many = had.length || "none"
        console.log(`${par} open_ontrack! ${many} waiting`)
        // < multiple tracks, one at a time?
        par.pc.ontrack = (e) => {
            console.log(`${par} par.pc.ontrack: `+ e.streams[0].getTracks())
            par.fresh.input(e.streams[0])
        };
        had.map(e => {
            console.log(`${par} par.pc.ontrack from queue:`)
            par.pc.ontrack(e)
        })
        delete par.ontrack_queue
    }
    lets_send_our_track(par) {
        if (!this.is_par_pc_ready(par)) {
            debugger
            return
        }
        let localStream:MediaStream = this.party.get_localStream?.()
        if (!localStream) throw "!localStream"
        console.log(`${par} lets_send_our_track!`,localStream.getTracks())
        
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
                track.onended = async () => {
                    await this.par.pc.removeTrack(sender);
                    // hopefully it will go again?
                    par.outgoing = par.outgoing.filter(tr => tr != track)
                    console.warn("${par} Track Ended")
                }
                par.outgoing.push(track)
                console.log(`${par} was sent our track`,{track,localStream,sender})

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










    // want to include the data channel in the initial negotiation
    // data channel originates from the !polite peer
    //  = receiver of the first offer = older non-joining one
    // put handlers of replies in party.par_msg_handler.$type
    // sync after new RTCPeerConnection
    initDataChannel(pc) {
        // temporarily host the channel object on the pc itself
        // because par is not made yet
        // < it probably should be... 
        if (pc.channel) throw "already pc.channel"
        pc.channel = pc.createDataChannel("participants");
        pc.channel.onmessage = (e) => (pc.channel_msg ||= []).push(e)
    }
    incomingDataChannel(par,channel) {
        par.channel = channel
        this.createDataChannel(par,'handlers_only')
    }
    createDataChannel(par,handlers_only) {
        const pc = par.pc
        if (handlers_only) {
            if (!par.channel) throw "no channel to handle"
        }
        else {
            par.channel = pc.channel
            if (!par.channel) throw "no pc.channel to adopt"
            delete pc.channel
        }
        // we have broken the symmetry of its origin via polite
        par.channel.onmessage = (event) => {
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
    
        // you (eg Measuring) can send messages.
        // like socket.io
        par.emit = (type,data) => {
            if (!par.channel || par.channel.readyState != "open") {
                return console.error(`channel ${par} not open yet, dropping message type=${type}`)
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
        console.log(`${par} createDataChannel`
            +(handlers_only?"-handlers":''),par.channel)


        par.channel.onerror = (e) => {
            console.log(`Data error: ${par}: ${e.error}`,e);
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

        // process any waiting messages now we've a handler
        pc.channel_msg?.map(e => par.channel.onmessage(e))
        delete pc.channel_msg
    }

}
















