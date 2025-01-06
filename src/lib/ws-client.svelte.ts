import type { Socket } from "socket.io";
import { io } from "socket.io-client";

type peerId = string
type pc = RTCPeerConnection
export class SignalingClient {
    socket:Socket
    peerConnections:Map<peerId,pc>
    politePeerConnections:Map<peerId,boolean>
    on_close:Function
    on_peer_creation:Function
    on_peer:Function
    on_reneg: Function
    makingOffer: Map<PeerId, boolean>

    constructor(opt) {
        this.socket = io();
        this.peerConnections = new Map();
        this.politePeerConnections = new Map();
        Object.assign(this,opt)
        this.on_peer ||= (() => {});
        this.makingOffer = new Map();

        // Join a room
        this.socket.emit('join-room', 'room-1');

        // Setup event listeners
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        // When we get list of peers already in the room
        this.socket.on('peers-in-room', async ({ peers }) => {
            // Create an offer for each existing peer
            for (const peerId of peers) {
                this.offerPeerConnection(peerId);
            }
        });

        // When a new peer joins
        this.socket.on('peer-joined', async ({ peerId }) => {
            console.log('New peer:', peerId);
            // peerId are about to get our peerId via peers-in-room and emit offer
        });

        // When we receive an offer
        this.socket.on('offer', async ({ offer, offererId }) => {
            console.log("offer from "+offererId, offer);
            const pc = await this.createPeerConnection(offererId);
            
            try {
                const offerCollision = pc.signalingState !== "stable" 
                    || this.makingOffer.get(offererId);

                // Important: We're always the polite peer when receiving an offer
                //  < are we? looks like either side could renegotiate->offer first
                if (offerCollision) {
                    // each pair of peers has an originator, who shall be the polite one
                    if (this.politePeerConnections.get(offererId)) {
                        // we are the polite peer
                        console.log(`Handling offer collision for ${offererId} - politely`);
                        await Promise.all([
                            pc.setLocalDescription({type: "rollback"}),
                            pc.setRemoteDescription(offer)
                        ]);
                    } else {
                        throw new Error("Impolite peer should not rollback");
                    }
                } else {
                    await pc.setRemoteDescription(offer);
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                this.socket.emit('answer', {
                    targetId: offererId,
                    answer
                });
            } catch (err) {
                console.error(`Error handling offer from ${offererId}:`, err);
                // Could implement recovery logic here
                if (pc.signalingState !== "stable") {
                    console.warn(`    Unstable state after offer handling: ${pc.signalingState}`);
                }
            }
        });

        // When we receive an answer
        this.socket.on('answer', async ({ answer, answererId }) => {
            const pc = this.peerConnections.get(answererId);
            if (!pc) return;
            // < sometimes get: 
            //    Uncaught (in promise) InvalidStateError: Failed to 
            //     execute 'setRemoteDescription' on 'RTCPeerConnection':
            //     Failed to set remote answer sdp:
            //     Called in wrong state: have-remote-offer
            // so lets try...
            try {
                // Check state right before attempting to set the description
                const currentState = pc.signalingState;
                console.log(`Processing answer in state: ${currentState} for ${answererId}`);
                
                if (currentState === "have-local-offer") {
                    await pc.setRemoteDescription(answer);
                } else if (currentState === "stable") {
                    console.warn(`Got answer in stable state for ${answererId} - ignoring`);
                } else {
                    console.warn(`Unexpected state ${currentState} while processing answer for ${answererId}`);
                }
            } catch (err) {
                console.error(`Error setting remote description for ${answererId}:`, err);
                // Optionally handle recovery here
                if (pc.signalingState === "stable") {
                    console.log(`Connection ${answererId} reached stable state despite error`);
                } else {
                    // Could implement recovery logic here
                    console.warn(`Connection ${answererId} in uncertain state:`, pc.signalingState);
                }
            }
        });

        // When we receive an ICE candidate
        this.socket.on('ice-candidate', async ({ candidate, from }) => {
            const pc = this.peerConnections.get(from);
            if (!pc) return;
            try {
                await pc.addIceCandidate(candidate);
            } catch (e) {
                // Ignore candidates if we're not in the right state
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    console.error("ICE candidate error:", e);
                }
            }
        });
    }

    // the high-level action
    // create a connection (usually) and send an offer of it
    // on room join, the newbie sends offers to everyone
    async offerPeerConnection(peerId,pc?) {
        pc ||= await this.createPeerConnection(peerId);
        
        // each pair of peers has an originator, who shall be the polite one
        this.politePeerConnections.set(peerId,true)
        console.log("Polite Polite Polite Polite Polite offer")
        
        try {
            this.makingOffer.set(peerId, true);
            const offer = await pc.createOffer();
            
            if (pc.signalingState !== "stable") console.log(`@@@ offerPeerConnection sig=${pc.signalingState}`)
            if (pc.signalingState !== "stable") return;
            
            await pc.setLocalDescription(offer);
            this.socket.emit('offer', {
                targetId: peerId,
                offer
            });
        } catch (err) {
            console.error("Error creating offer:", err);
        } finally {
            this.makingOffer.set(peerId, false);
        }
    }

    async createPeerConnection(peerId) {
        // we replace these rather than deal with negotiation
        let was = this.peerConnections.get(peerId);
        if (was) {
            // Only replace if the connection is failed or closed
            if (was.connectionState === 'failed' || was.connectionState === 'closed') {
                console.log(`Replacing failed/closed connection for ${peerId}`);
                await was.close();
                // < is there any state stickiness,
                //    par.channel should replace itself onclose?
            } else if (was.signalingState === 'stable' && was.connectionState === 'connected') {
                console.log(`Reusing stable connection for ${peerId}`);
                return was;
            } else if (was.signalingState === 'have-local-offer' && Date.now() - was.creation_time < 900) {
                console.log(`Waiting for very recent offer to complete for ${peerId}`);
                return was;
            }
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });
        pc.creation_time = Date.now()
        const polite = this.politePeerConnections.get(peerId)
        console.log("createPeerConnection "+(polite?"POLITELY":""))
        this.on_peer_creation?.({pc,polite})

        // Store it in our map
        this.peerConnections.set(peerId, pc);
        this.makingOffer.set(peerId, false);

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: peerId,  // Send to specific peer
                    candidate: event.candidate
                });
            }
        };

        // negotiation handling
        // PeerJS doesn't do this,
        //   it adds everything to par.pc early enough to not need to
        // < and perhaps neither will we... see 'because crypto trust'
        // < if the signaling server forwards peerId,name,cryptotrust
        //    we could add everything early enough too.
        //    we're currently waiting for stable->datachanneling->tracking
        // supposedly we do: https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/
        pc.onnegotiationneeded = async () => {
            try {
                // Only renegotiate if we're in a stable state
                if (pc.signalingState === "stable" && !this.makingOffer.get(peerId)) {
                    console.log(`Starting negotiation for ${peerId}`);
                    await this.renegotiate(pc, peerId);
                } else {
                    console.log(`Skipping negotiation - state: ${pc.signalingState}, makingOffer: ${this.makingOffer.get(peerId)}`);
                }
            } catch (err) {
                console.error("Negotiation error:", err);
            }
        };

        // Only call on_peer for new connections
        // Let them store it in their SvelteMap,
        //  and attach whatever else (eg .ontrack)
        if (!was) {
            this.on_peer({ peerId, pc });
        }

        return pc;
    }

    async renegotiate(pc,peerId) {
        if (this.makingOffer.get(peerId)) {
            console.log(`Already making offer for ${peerId}`);
            return;
        }
    
        try {
            this.makingOffer.set(peerId, true);
            const offer = await pc.createOffer();
            
            if (pc.signalingState === "stable") {
                await pc.setLocalDescription(offer);
                this.socket.emit('offer', {
                    targetId: peerId,
                    offer
                });
            }
        } catch (err) {
            console.error("Error during renegotiation:", err);
        } finally {
            this.makingOffer.set(peerId, false);
        }
    }
    // < GONE?
    // < possible easy-way-out?
    // just replace the whole pc when any settings change
    async fatal_renegotiate(pc,peerId) {
        // < takes tons of code apparently
        //   would we avoid interrupting their tracks while somethinging around?
        await pc.close()
        setTimeout(() => {
            this.offerPeerConnection(peerId);
        },200)
    }

    close() {
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        this.makingOffer.clear();
        this.socket.disconnect();
        this.on_close?.();
    }
}