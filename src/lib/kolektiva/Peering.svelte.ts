
// import { SignalingClient } from "$lib/ws-client.svelte";
import type { Socket } from "socket.io";
import { io } from "socket.io-client";
import { tick } from "svelte";
import type { Party } from "./Party.svelte";
import { Participant } from "./Participants.svelte";
// < hopefully this problem goes away:
            // < for some reason we have to seek out the par again at this point
            //   not doing this leads to this.par.name being undefined
            //    much later in parRecorder.uploadCurrentSegment
            //    see "it seems like a svelte5 object proxy problem"

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
class Paring {
    // JOIN party.participants.
    peerId: string
    // < creation of
    par: Participant
    // == par.pc
    // < but it probably belongs here
    pc: RTCPeerConnection
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
    public onPeerReady:Function
    public onStateChange:Function

    constructor(opt) {
        Object.assign(this, opt)
        this.setupSocket();

        // < this.party.get_forever("room")
        this.room = this.room;
        this.socket.emit('join-room', this.room);

        // < was passed around, mostly via sock()
        this.party.Signaling = this
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
            // try {
                await ing.pc.addIceCandidate(candidate);
            // } catch (e) {
            //     // Ignore candidates if we're not in the right state
            //     if (pc.remoteDescription && pc.remoteDescription.type) {
            //         console.error("ICE candidate error:", e);
            //     }
            // }
        });
    }



// #region pc
    
    async offerPeerConnection(peerId:peerId) {
        let ing = this.ings.get(peerId);
            
        if (!ing) {
            // data channel originates from the other, !polite peer
            //  = receiver of the first offer = older non-joining peer
            ing = await this.createPeer(peerId);
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
        const pc = new RTCPeerConnection({
            // < run one of these:
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

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
        // you (eg Measuring) can send messages.
        // like socket.io
        par.emit = (type,data) => {
            if (!par.channel || par.channel.readyState != "open") {
                return console.error(`channel ${par} not open yet, dropping message type=${type}`)
            }
            par.channel.send(JSON.stringify({type,...data}))
        }
        // pair, separate for aesthetics
        par.ing = ing
        ing.par = par
        // < GOING
        par.pc = ing.pc

        par.on_created?.(this.party,ing)
    }
    private setupPeerHandlers(ing: Paring) {
        ing.pc.oniceconnectionstatechange = () => {
            this.handleICEStateChange(ing);
        };

        ing.pc.ondatachannel = ({ channel }) => {
            console.log(`${ing} channel arrived`);
            ing.channel = channel;
            this.setupDataChannelHandlers(ing);
        };

        ing.pc.onnegotiationneeded = async () => {
            await this.handleNegotiationNeeded(ing);
        };
    }
    private initDataChannel(ing: Paring) {
        console.log(`${ing} channel create`);
        ing.channel = ing.pc.createDataChannel('main');
        this.setupDataChannelHandlers(ing);
    }
    private setupDataChannelHandlers(ing: Paring) {
        ing.channel.onerror = (e) => {
            console.error(`${ing} channel error: ${e.error}`,e);
        };
        ing.channel.onopen = () => {
            this.handleChannelOpen(ing);
        };
        ing.channel.onclose = () => {
            this.handleChannelClose(ing);
        };
        ing.channel.onmessage = (event) => {
            this.handleChannelMessage(ing, JSON.parse(event.data));
        };
    }
    // < these could be Paring methods
    handleChannelOpen(ing) {
        // < delete par.offline? or rely on a positive ping to?
        this.updatePeerState(ing, 'connected');
        this.sendIdentity(ing);
        delete par.bitrate;
        console.warn(`${ing} channel close: ${e.error}`,e);
    }
    handleChannelClose(ing) {
        delete ing.par.bitrate;
        console.warn(`${ing} channel close`);
    }
    // < put at a higher level, no other name in here
    sendIdentity(ing) {
        console.log(`${ing} sendIdentity`)

        ing.emit("participant",{name:ing.par.party.userName})
    }
    // channel.onmessage
    // put handlers of replies in party.par_msg_handler.$type
    handleChannelMessage(ing, data) {
        let handler = ing.par.party.par_msg_handler[data.type]
        if (!handler) {
            return console.warn(`${ing} channel !handler for message type: `,data)
        }
        ing.par = ing.par.party.repar(ing.par)

        handler(ing.par,data)
    }
    


    // socket.onmessage type=offer
// #region offer
    // < can be randomy remade at any time?
    async makeOffer(ing) {
        ing.signalingState = 'offering';
        const offer = await ing.pc.createOffer();
        await ing.pc.setLocalDescription(offer);

        this.socket.emit('offer', {
            targetId: ing.peerId,
            offer
        });
    }
    private async handleOffer(peerId: peerId, offer: RTCSessionDescriptionInit) {
        let ing = this.ings.get(peerId);
        
        if (!ing) {
            ing = await this.createPeer(peerId, true);
        }

        try {
            const offerCollision = 
                ing.pc.signalingState !== 'stable' || 
                ing.signalingState === 'offering';

            if (offerCollision && !ing.polite) {
                console.log(`${ing} Ignoring colliding offer (impolite peer)`);
                return;
                // the other peer should receive our offer and
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
            this.handleSignalingFailure(ing);
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
    
    private updatePeerState(ing: Paring, newState: PeerState) {
        const oldState = ing.state;
        ing.state = newState;
        ing.lastStateChange = Date.now();

        if (newState === 'ready' && oldState !== 'ready') {
            this.onPeerReady?.(ing);
        }

        this.onStateChange?.(ing.peerId, newState);
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
                    await this.retryConnection(ing);
                } else {
                    this.updatePeerState(ing, 'failed');
                }
                break;
        }
    }
    
    private async handleNegotiationNeeded(ing: Paring) {
        if (ing.signalingState !== 'stable') {
            console.log('Skipping negotiation - not stable: '+ ing.signalingState);
            setTimeout(() => {
                console.log('Skipping negotiation - 100ms later: '+ ing.signalingState);
            },100)
            setTimeout(() => {
                console.log('Skipping negotiation - 500ms later: '+ ing.signalingState);
            },500)
            return;
        }

        try {
            await this.makeOffer(ing)
        } catch (err) {
            console.error('Negotiation failed:', err);
            this.handleNegotiationFailure(ing);
        } finally {
            ing.signalingState = 'stable';
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
    
    handleSignalingFailure(ing) {
        console.error("< handle handleSignalingFailure(ing)")
    }




//#region stop
    stop() {
        console.log("Peering stop()")
        for (const peer of this.ings.values()) {
            peer.pc.close();
        }
        this.ings.clear();
        this.socket.disconnect();
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
        if (par.is_ready) {
            console.log(`${par} still ready...`)
            return
        }
        console.log(`${par} couldbeready...`)
        if (par.name != null) {
            par.is_ready = true
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




















}
















