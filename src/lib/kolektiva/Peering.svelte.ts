
// import { SignalingClient } from "$lib/ws-client.svelte";
import type { Socket } from "socket.io";
import { io } from "socket.io-client";
import { tick } from "svelte";
import type { Party } from "./Party.svelte";
import { Participant } from "./Participants.svelte";
import { _D } from "$lib/Y";
// < hopefully this problem goes away:
            // < for some reason we have to seek out the par again at this point
            //   not doing this leads to this.par.name being undefined
            //    much later in parRecorder.uploadCurrentSegment
            //    see "it seems like a svelte5 object proxy problem"

// negotiation handling
// PeerJS doesn't do this,
//   it adds everything to par.pc early enough to not need to
// < if the signaling server forwards peerId,name,cryptotrust
//    we could add everything early enough too.
//    we're currently waiting for stable->datachanneling->tracking
// supposedly we do: https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/

/**
 * WebRTC peer connection management with state tracking:
 * - Paring: Per-peer connection manager with RTCPeerConnection and DataChannel
 *   - state: Overall peer state (new->connected->ready)
 *   - signalingState: SDP negotiation state
 * - Participant: User representation with derived connection state
 *   - constate: Combined state string from PC/ICE/channel states
 *   - pc_ready: Connection readiness flag for track exchange
 *   - is_ready: High-level ready state after name exchange
 * 
 * Flow: socket.io join -> create Paring -> establish RTCPeerConnection -> 
 * exchange SDP/ICE -> open DataChannel -> exchange names -> exchange tracks
 * 
 * The polite peer responds to offers, impolite peer initiates DataChannel.
 * Track exchange begins only after connection is stable and names exchanged.
 */


// stuff to look at adopting from simple-peer: 
// < MAX_BUFFERED_AMOUNT, and large file transfers between peers?
// < ICECOMPLETE_TIMEOUT, as distinct from pc|datachannel-grade connection problem?
// < removeTrack (track, stream) etc
//    for actuating streamstopublish[] <-> ing.outgoings
//    that wants a matrix across all par?
//     par give clues how accepting they are
//      eg drum machine takes only rhythm direction
// a

// Types for state management
type PeerState = 'new' | 'connecting' | 'connected' | 'ready' | 'paused' | 'failed';
type SignalingState = 'new' | 'offering' | 'answering' | 'stable';

// < have a par.ing 1:1 object to extract this biz from par:
interface Paring {
    peerId: string;
    pc: RTCPeerConnection;

    state: PeerState;
    signalingState: SignalingState;
    polite: boolean;
    channel?: RTCDataChannel;
    
    lastStateChange: number;
    retryCount: number;
}

// channel may have higher latency while uploading files
const MAX_BUFFER = 64 * 1024; // 64KB
const LOW_BUFFER = MAX_BUFFER * 0.8; // Start sending again at 80%
export class Paring {
    // JOIN party.participants.
    peerId: string
    // < creation of
    par: Participant
    // == par.pc
    // < but it probably belongs here
    pc: RTCPeerConnection
    channel: RTCDataChannel
    // < show in ui
    state: PeerState = $state()
    toString() {
        return this.par?.name ?? this.peerId
    }
    lastStateChange: number
    retryCount: number

    constructor(opt) {
        Object.assign(this, opt)
    }
    stop() {
        // Stop all tracks
        this.pc.getSenders().forEach(sender => sender.track?.stop());
        this.pc.close();
    }

    // you (eg Measuring) can send messages.
    // like socket.io
    async emit(
        type: string,
        data: any,
        options: {
            priority?: 'high' | 'normal' | 'low',
        }) {

        options ||= {}
        const { priority = 'high' } = options;
        if (!this.channel || this.channel.readyState != "open") {
            console.error(`${this} channel not open, cannot send message type=${type}`);
            return false;
        }
        
        try {
            // put in type
            data = {type, ...data}
            // may take out buffer
            // < {buffer, ...data} = {type, ...data} !?
            let buffer:Uint8Array|null = data.buffer
            delete data.buffer

            let json = JSON.stringify(data);
            let encoded: Uint8Array;

            // put a header on?
            if (buffer) {
                // Binary mode: 'b' + JSON + '\n' + binary data
                let header = new TextEncoder().encode('b'+json+"\n")
                encoded = new Uint8Array(header.length + buffer.byteLength);
                encoded.set(header, 0);
                encoded.set(new Uint8Array(buffer), header.length);
            }
            else {
                // the whole message is JSON
                encoded = new TextEncoder().encode(json)
                _D("emit()",{json,data})
            }

            // Queue handling
            if (this.channel.bufferedAmount > MAX_BUFFER) {
                this._paused = true;
                return new Promise((resolve, reject) => {
                    this._sendQueue.push({ data: encoded, resolve, reject });
                    
                    // Sort queue by priority if needed
                    if (priority === 'high') {
                        this._sendQueue.sort((a, b) => 
                            (a.data['priority'] === 'high' ? -1 : 1));
                    }
                });
            }

            this.channel.send(encoded);
            return true;
        } catch (err) {
            console.error(`Failed to send message: ${err}`);
            return false;
        }
    }
    unemit(encoded: ArrayBuffer) {
        // - If you send a string via channel.send(string),
        //    you get a string in event.data
        // - If you send any kind of ArrayBuffer, TypedArray,
        //     or DataView via channel.send(binary),
        //    you get an ArrayBuffer in event.data
        // but you can treat them the same!
        let part = 'decoding'
        try {
            const view = new Uint8Array(encoded);
            if (view[0] === 98) {  // 'b' character
                const newlineIndex = Array.from(view).findIndex(byte => byte === 10);
                if (newlineIndex === -1) throw new Error('Invalid binary message format');
                
                const text = new TextDecoder().decode(view.slice(1, newlineIndex));
                const buffer = view.slice(newlineIndex + 1);
                const data = JSON.parse(text);
                return this.handleMessage({...data,buffer});
            }
            // the whole message is JSON
            const json = new TextDecoder().decode(view);
            let data = JSON.parse(json)
            _D("unemit()",{json,data})
            part = 'handling'
            return this.handleMessage(data);
        } catch (err) {
            console.error(`Error in unemit() ${part}: ${err}`);
        }
    }
    private handleMessage(data: any) {
        const handler = this.par.party.par_msg_handler[data.type] 
            ?? this.par.msg_handler?.[data.type];
            
        if (!handler) {
            return console.warn(`${this} channel !handler for message type:`, data);
        }

        handler(this.par, data);
    }

    // Process queued messages
    _paused = false
    _processEmitQueue() {
        while (!this._paused && this._sendQueue.length > 0) {
            const { data, resolve } = this._sendQueue.shift()!;
            
            try {
                this.channel!.send(data);
                resolve();
                
                if (this.channel!.bufferedAmount > MAX_BUFFER) {
                    this._paused = true;
                    break;
                }
            } catch (err) {
                console.error('Error sending queued data:', err);
            }
        }
    }
}



// front ws-client, do par coming-going
//  not for par that are par.local of course.
type peerId = string
export class Peering {
    socket:Socket
    private ings: Map<peerId, Paring> = new Map()
    // < this as our only form of security
    //  < push button invite par to a new room
    room = 'Jam Space'
    party: Party
    private readonly maxRetries = 3;
    private readonly retryDelay = 1000;
    // < dubious? simpler just reading ing.state since it is $state()
    public onPeerReady: (ing: Paring) => void;

    // < run one of these, and a https://github.com/coturn/coturn
    iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.stunprotocol.org:3478' }
    ]

    constructor(opt) {
        Object.assign(this, opt)
        this.setupSocket();
        // we share the socket to the party so it can be used for eg audio-upload
        this.party.socket = this.socket

        // < this.party.get_forever("room")
        this.room = this.room;
        this.socket.emit('join-room', this.room);
    }






    // move down near offer etc
    setupSocket() {
        this.socket = io();
        
        // When we get list of peers already in the room
        this.socket.on('peers-in-room', async ({ peers }) => {
            // Create an offer for each existing peer
            for (const peerId of peers) {
                this.offerPeerConnection(peerId);
            }
        });
        // and when others join the room
        this.socket.on('peer-joined', async ({ peerId }) => {
            console.log('New peer:', peerId);
            // they are about to get our peerId via peers-in-room
        });
        this.socket.on('offer', async ({ offer, offererId:peerId }) => {
            await this.handleOffer(peerId,offer)
        })
        this.socket.on('answer', async ({ answer, answererId:peerId }) => {
            await this.handleAnswer(peerId, answer);
        })
        this.socket.on('ice-candidate', async ({ candidate, from:peerId }) => {
            let ing = this.ings.get(peerId);
            try {
                await ing.pc.addIceCandidate(candidate);
            } catch (e) {
                // Ignore candidates if we're not in the right state
                if (ing.pc.remoteDescription && ing.pc.remoteDescription.type) {
                    console.error("ICE candidate error:", e);
                }
            }
        });
    }



// #region pc
    
    async offerPeerConnection(peerId:peerId) {
        let ing = this.ings.get(peerId);
            
        if (!ing) {
            // data channel originates from the other, !polite peer
            //  = receiver of the first offer = older non-joining peer
            ing = await this.createPeer(peerId,false);
        }
        
        try {
            // this part is common with handleNegotiationNeeded()  
            await this.makeOffer(ing)
        } catch (err) {
            console.error('offerPeerConnection failed:', err);
        }
    }
    // part of offerPeerConnection() or handleOffer()
    private async createPeer(peerId: peerId, polite: boolean): Promise<Paring> {
        const pc = new RTCPeerConnection({iceServers:this.iceServers});

        const ing = new Paring({
            peerId,
            pc,
            state: 'new',
            signalingState: 'new',
            polite,
            lastStateChange: Date.now(),
            retryCount: 0
        })
        this.createAlsoPar(ing)
        this.setupPeerHandlers(ing);
        this.ings.set(peerId, ing);

        // Only non-polite peers initiate data channel
        if (!polite) {
            this.initDataChannel(ing);
        }
        let politism = ing.polite ? 'polite' : ''
        console.log(`${ing} createPeer ${politism}`);

        return ing;
    }
    private async createAlsoPar(ing) {
        // < where to start having name|cryptotrust meta
        //    and start allowing multiple pc? what for?
        // < multiple tracks coming from this pc|par
        //    each one wants a Rack etc
        let peerId = ing.peerId
        let was = this.party.find_par({ peerId })
        // indexed by the peerId
        let par = this.party.createPar({peerId})
        // pair, separate for aesthetics
        // both have emit
        par.ing = ing
        ing.par = par
        // < GOING
        par.pc = ing.pc

        par.on_created?.(this.party,ing)
    }
    private setupPeerHandlers(ing: Paring) {
        let perc_state = () => this.updateConnectionState(ing)
        ing.pc.oniceconnectionstatechange = () => {
            this.handleICEStateChange(ing);
            perc_state()
        };
        ing.pc.onsignalingstatechange = perc_state
        ing.pc.onconnectionstatechange = perc_state

        ing.pc.ondatachannel = ({ channel }) => {
            console.log(`${ing} ondatachannel: ${channel.label}`, channel.readyState);
            ing.channel = channel;
            this.setupDataChannelHandlers(ing);
            perc_state()
        };

        ing.pc.onnegotiationneeded = async () => {
            await this.handleNegotiationNeeded(ing);
        };

        ing.pc.onicecandidate = async ({candidate}) => {
            if (candidate) {
                await this.handleICECandidate(ing, candidate);
            }
        };

        ing.pc.onicecandidateerror = (event) => {
            if (event.errorCode === 701) {
                // console.log(`${ing} STUN timeout for ${event.url} (expected for IPv6)`);
                if (!event.address.startsWith('[')) console.warn(`${ing} STUN timeout for ${event.url} (non-IPv6: ${event.address})`)
                return;
            }
            console.warn(`${ing} ICE candidate error:`, event);
        };

    }
    private updateConnectionState(ing: Paring) {
        const states = [
            ing.pc.connectionState,
            ing.pc.signalingState,
            ing.pc.iceConnectionState,
            ing.channel?.readyState ?? "?"
        ];
        const newState = states.join('/');
        const par = ing.par;
        
        if (newState !== par.constate) {
            par.constate = newState;
            console.log(`-o- ${ing} is ${newState}`);
    
            // Update pc_ready state
            par.pc_ready = (
                ["connected", "connecting"].includes(ing.pc.connectionState) &&
                ["stable"].includes(ing.pc.signalingState)
            );
    
            // Update offline state based on channel
            par.offline = !ing.channel || ing.channel.readyState !== "open";
    
            // Check if state change enables further progress
            this.couldbeready(par);
        }
    }

//#region channel
    private initDataChannel(ing: Paring) {
        console.log(`${ing} channel create`);
        ing.channel = ing.pc.createDataChannel('main',{
            negotiated: false,  // Let's be explicit
            id: null           // Let WebRTC pick the ID
        });
        this.setupDataChannelHandlers(ing);
    }
    private setupDataChannelHandlers(ing: Paring) {
        ing.channel.onerror = (e) => {
            console.error(`${ing} channel error: ${e.error}`,e);
        };
        ing.channel.onopen = () => {
            this.handleChannelOpen(ing);
            this.updateConnectionState(ing);
        };
        ing.channel.onclose = (e) => {
            this.handleChannelClose(ing,e);
            this.updateConnectionState(ing);
        };
        ing.channel.onmessage = (e) => {
            this.handleChannelMessage(ing, e.data);
        };
        ing.channel.bufferedAmountLowThreshold = LOW_BUFFER;
        ing.channel.onbufferedamountlow = () => {
            ing._paused = false;
            ing._processEmitQueue();
        };
    }
    // < these could be Paring methods
    handleChannelOpen(ing) {
        // < delete par.offline? or rely on a positive ping to?
        this.updatePeerState(ing, 'ready');
        this.sendIdentity(ing);
        console.log(`${ing} channel open`);
    }
    handleChannelClose(ing,e) {
        delete ing.par.bitrate;
        console.warn(`${ing} channel close`,e);
    }
    // < put at a higher level, no other name in here
    sendIdentity(ing) {
        console.log(`${ing} sendIdentity`)

        ing.emit("participant",{name:ing.par.party.userName})
    }
    // channel.onmessage
    // put handlers of replies in party.par_msg_handler.$type
    handleChannelMessage(ing, data) {
        ing.par = ing.par.party.repar(ing.par)
        ing.unemit(data)
    }
    


    // socket.onmessage type=offer
// #region offer
    // < can be randomy remade at any time?
    async makeOffer(ing) {
        ing.signalingState = 'offering';
        try {
            const offer = await ing.pc.createOffer();
            await ing.pc.setLocalDescription(offer);
    
            this.socket.emit('offer', {
                targetId: ing.peerId,
                offer
            });
        } catch (err) {
            if (err.name === 'InvalidAccessError' && err.message.includes('m-lines')) {
                console.warn(`${ing} renegotiation ordering issue, retrying`);
                // Could implement recovery here
                return;
            }
            throw err;  // Let caller handle other errors
        }
    }
    private async handleOffer(peerId: peerId, offer: RTCSessionDescriptionInit) {
        let ing = this.ings.get(peerId);
        
        if (!ing) {
            // we're politely receiving the offer
            ing = await this.createPeer(peerId, true);
        }

        try {
            const offerCollision = 
                ing.pc.signalingState !== 'stable' || 
                ing.signalingState === 'offering';

            if (offerCollision && !ing.polite) {
                console.log(`${ing} Ignoring colliding offer (impolite peer)`);
                return;
                // the other peer should receive our offer and ...
            }

            if (offerCollision) {
                // we are the polite peer
                console.log(`${ing} Handling colliding offer politely`)
                await Promise.all([
                    ing.pc.setLocalDescription({ type: 'rollback' }),
                    ing.pc.setRemoteDescription(offer)
                ]);
            } else {
                await ing.pc.setRemoteDescription(offer);
            }

            const answer = await ing.pc.createAnswer();
            await ing.pc.setLocalDescription(answer);

            this.socket.emit('answer', {
                targetId: peerId,
                answer
            });
        } catch (err) {
            console.error('Error handling offer:', err);
            console.error(`  will retry...`);
            this.retryConnection(ing)
        }
    }
    
    private async handleAnswer(peerId: peerId, answer: RTCSessionDescriptionInit) {
        const ing = this.ings.get(peerId);
        if (!ing) return;
        
        try {
            const currentState = ing.pc.signalingState;
            console.log(`Processing answer in state: ${currentState} for ${peerId}`);
            
            if (currentState === "have-local-offer") {
                await ing.pc.setRemoteDescription(answer);
            } else if (currentState === "stable") {
                console.warn(`Got answer in stable state for ${peerId} - ignoring`);
            } else {
                console.warn(`Unexpected state ${currentState} while processing answer for ${peerId}`);
            }
        } catch (err) {
            console.error(`Error setting remote description for ${peerId}:`, err);
            if (ing.pc.signalingState === "stable") {
                console.log(`Connection ${peerId} reached stable state despite error`);
            } else {
                console.warn(`Connection ${peerId} in uncertain state:`, ing.pc.signalingState);
            }
        }
    }

    // then magically!
    private handleICECandidate(ing: Paring, candidate: RTCIceCandidate) {
        console.log(`${ing} ICE candidate: ${candidate.type} ${candidate.protocol} ${candidate.address||'[redacted]'}:${candidate.port}`);
        this.socket.emit('ice-candidate', {
            targetId: ing.peerId,
            candidate
        });
    }
    
    private updatePeerState(ing: Paring, newState: PeerState) {
        const oldState = ing.state;
        ing.state = newState;
        ing.lastStateChange = Date.now();

        if (newState === 'ready' && oldState !== 'ready') {
            this.onPeerReady?.(ing);
        }
    }

    private async handleICEStateChange(ing: Paring) {
        const state = ing.pc.iceConnectionState;

        switch (state) {
            case 'connected':
                if (ing.channel?.readyState === 'open') {
                    this.updatePeerState(ing, 'ready');
                }
                break;
            case 'failed':
                if (ing.retryCount < this.maxRetries) {
                    this.retryConnection(ing);
                } else {
                    this.updatePeerState(ing, 'failed');
                }
                break;
        }
    }
    
    private async handleNegotiationNeeded(ing: Paring) {
        try {
            await this.makeOffer(ing)
        } catch (err) {
            console.error('Negotiation failed:', err);
            console.error(`  will retry...`);
            this.retryConnection(ing)
        }
    }

    private async retryConnection(ing: Paring) {
        ing.retryCount++;
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        
        try {
            await ing.pc.restartIce();
            if (!ing.polite) {
                await this.handleNegotiationNeeded(ing);
            }
        } catch (err) {
            console.error('Retry failed:', err);
            this.updatePeerState(ing, 'failed');
        }
    }




//#region stop
    stop() {
        console.log("Peering stop()")
        this.stop_ings()
        this.ings.clear();
        // < put off until audio-uploads complete
        this.socket.disconnect();
    }
    // stop all peer connections
    // the definitely-immediate part of Peering.stop()
    //   which can wait a little longer for audio-upload via websocket to finish
    stop_ings() {
        for (const ing of this.ings.values()) {
            ing.stop()
        }
    }




    // these are a low-level preamble to the lifetime of a par
    // overall:
    //  par.new_pc() occurs immediately, but only does pc measuring
    //  ...then there are these prosthetic steps below...
    //  par.on_ready() is the high-level, send|receive tracks time
    // anyway this fires any time we might have satisfied its rules
    async couldbeready(par) {
        if (!par.pc_ready) {
            if (par.is_ready) {
                console.log(`${par} couldbeready? already, but not now`)
                return
            }
            // wait for par.pc to get in a good state
            console.log(`${par} couldbeready? not ready`)
            return
        }
        if (!par.ing.channel) {
            console.log(`${par} couldbeready? but no channel`)
            return
        }
        if (par.is_ready) {
            console.log(`${par} couldbeready already`)
            return
        }
        // their channel delivers to us their name
        if (par.name == null) {
            console.log(`${par} couldbeready... but for no name!`)
            return
        }

        // this is ready!
        // and our par.effects will be created with fully name
        try {
            // Run operations in sequence
            par.on_ready();
            await this.lets_send_our_track(par);
            this.open_ontrack(par);

            // Mark as ready after operations complete
            // < when to reset this?
            par.is_ready = true;
        } catch (error) {
            console.error(`${par} failed to become ready:`, error);
            par.is_ready = false;
            // These functions are designed to be retriggered by state changes anyway
            // so we don't need explicit retry logic here
        }
    }








    // we wait to accept tracks
    //  race between our par.effects building after par.name
    //   and their track arriving here after they get our par.name
    // < because crypto trust
    open_ontrack(par:Participant) {
        let had = par.ontrack_queue || []
        let many = had.length || "none"
        console.log(`${par} open_ontrack! ${many} waiting`)
        // < multiple tracks, one at a time?
        par.pc.ontrack = (e) => {
            console.log(`${par} par.pc.ontrack: `,
                {par:par,tracks:e.streams[0].getTracks()})
                
            par.party.status_msg(`Got ${par}`)
            par.onTrack(e.streams[0])
        };
        had.map(e => {
            console.log(`${par} par.pc.ontrack from queue:`)
            par.pc.ontrack(e)
        })
        delete par.ontrack_queue
    }
    async lets_send_our_track(par) {
        let localStream:MediaStream = this.party.get_localStream?.()
        if (!localStream) throw "!localStream"
        console.log(`${par} lets_send_our_track!`,localStream.getTracks())
        
        let already_id = (id) => par.outgoing.filter(tr => tr.id == id)[0]

        for (const track:MediaStreamTrack of localStream.getTracks()) {
            if (par.outgoing.includes(track)) {
                if (!already_id(track.id)) {
                    debugger; 
                    throw "pos-ob neg-id"
                }
                continue
            }
            if (already_id(track.id)) {
                debugger;
                throw "ne-ob pos-id"
            }
            try {
                const sender = par.pc.addTrack(track, localStream);
                let before_sent = true
                track.onended = async () => {
                    if (before_sent) {
                        // odd
                        throw "track.onended during party.on_addTrack"
                    }
                    await par.pc.removeTrack(sender);
                    // hopefully it will go again?
                    par.outgoing = par.outgoing.filter(tr => tr != track)
                    console.warn(`${par} Track Ended`)
                }
                await this.party.on_addTrack?.(par,track,sender,localStream)
                before_sent = false
                par.outgoing.push(track)
                console.log(`${par} was sent our track`,{track,localStream,sender})

            } catch (error) {
                console.error("Failed to add track:", error);
            }
        }
    }




















}
















