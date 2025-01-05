import type { Socket } from "socket.io";
import { io } from "socket.io-client";

type peerId = string
type pc = RTCPeerConnection
export class SignalingClient {
    socket:Socket
    peerConnections:Map<peerId,pc>
    on_close:Function
    on_peer:Function
    on_reneg: Function
    makingOffer: Map<PeerId, boolean>

    constructor(options: any = {}) {
        this.socket = io();
        this.peerConnections = new Map();
        this.on_peer = options.on_peer || (() => {});
        this.on_close = options.on_close;
        this.on_reneg = options.on_reneg;
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
            const offerCollision = pc.signalingState !== "stable"
                || this.makingOffer.get(offererId);
            
            // We're the polite peer (receiver of the offer)
            if (offerCollision) {
                await Promise.all([
                    pc.setLocalDescription({ type: "rollback" }),
                    pc.setRemoteDescription(offer)
                ]);
            } else {
                await pc.setRemoteDescription(offer);
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit('answer', {
                targetId: offererId,  // Send answer back to peer who made offer
                answer
            });
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
            if (pc.signalingState === "stable") {
                console.warn(`Got answer but art stable ${answererId}`)
            }
            await pc.setRemoteDescription(answer);
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
            let is_offered = was.signalingState == 'have-local-offer'
                && was.connectionState == 'new'
            let is_verynew = Date.now() - was.creation_time < 900
            if (is_offered || is_verynew) {
                // sometimes a remote reneg will send another offer
                console.log(`double-offer`,{is_offered,is_verynew})
                // we seem to have to close it and start over
                //  or we constate stays connecting, then goes failed
                // < or perhaps we should replace par?
                return was
            }
            console.warn(`already had a pc to ${peerId}, closing...`)
            await was.close()
        }

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });
        pc.creation_time = Date.now()

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
        // < if the signaling server forwards peerId,name,cryptotrust
        //    we could add everything early enough too.
        //    we're currently waiting for stable->datachanneling->tracking
        // < further betterment: https://blog.mozilla.org/webrtc/perfect-negotiation-in-webrtc/
        pc.onnegotiationneeded = async () => {
            console.warn(`onnegotiationneeded ${peerId}`)
            this.on_reneg?.({peerId,pc})

            // Debounce renegotiation attempts
            if (!this.makingOffer.get(peerId)) {
                await this.renegotiate(pc, peerId);
            }
        };

        // Let them store it in their SvelteMap,
        //  and attach whatever else (eg .ontrack)
        this.on_peer({ peerId, pc });

        return pc;
    }

    async renegotiate(pc,peerId) {
        try {
            if (pc.signalingState === "stable") {
                await this.offerPeerConnection(peerId, pc);
            } else {
                console.warn("Skipping renegotiation, signaling state:", pc.signalingState);
            }
        } catch (err) {
            console.error("Negotiation error for peer", err);
        }
    }
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