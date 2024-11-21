import type { Socket } from "socket.io";
import { io } from "socket.io-client";

type peerId = string
type pc = RTCPeerConnection
export class SignalingClient {
    socket:Socket
    peerConnections:Map<peerId,pc>
    on_close:Function
    on_peer:Function

    constructor(options = {}) {
        this.socket = io();
        this.peerConnections = new Map();
        this.on_peer = options.on_peer || (() => {});
        this.on_close = options.on_close;

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
                const pc = this.createPeerConnection(peerId);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.socket.emit('offer', {
                    targetId: peerId,  // This is who we want to connect to
                    offer
                });
            }
        });

        // When a new peer joins
        this.socket.on('peer-joined', async ({ peerId }) => {
            console.log('New peer:', peerId);
        });

        // When we receive an offer
        this.socket.on('offer', async ({ offer, offererId }) => {
            console.log("Got offer: ", offer);
            const pc = this.createPeerConnection(offererId);
            await pc.setRemoteDescription(offer);

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
            if (!pc) return
            await pc.setRemoteDescription(answer);
        });

        // When we receive an ICE candidate
        this.socket.on('ice-candidate', async ({ candidate, from }) => {
            const pc = this.peerConnections.get(from);
            if (!pc) return
            await pc.addIceCandidate(candidate);
        });
    }

    createPeerConnection(peerId) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        // Store it in our map
        this.peerConnections.set(peerId, pc);

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    targetId: peerId,  // Send to specific peer
                    candidate: event.candidate
                });
            }
        };

        // Let them store it in their SvelteMap,
        //  and attach whatever else (eg .ontrack)
        this.on_peer({ peerId, pc });

        return pc;
    }

    close() {
        // Close all peer connections
        this.peerConnections.forEach(pc => {
            pc.close();
        });
        this.peerConnections.clear();

        // Disconnect socket
        this.socket.disconnect();

        // Call optional close handler
        if (this.on_close) {
            this.on_close();
        }
    }
}