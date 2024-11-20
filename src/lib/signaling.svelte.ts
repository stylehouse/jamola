
import { io } from "socket.io-client";

export let sig = ({on_pc}) => {
    // Connect to signaling server
    const socket = io();
    const peerConnections = new Map(); // Store RTCPeerConnection for each peer

    // Join a room
    socket.emit('join-room', 'room-1');

    // When we get list of peers already in the room
    socket.on('peers-in-room', async ({ peers }) => {
        // Create an offer for each existing peer
        for (const peerId of peers) {
            const pc = createPeerConnection(peerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', {
                targetId: peerId,  // This is who we want to connect to
                offer
            });
        }
    });

    // When a new peer joins
    socket.on('peer-joined', async ({ peerId }) => {
        // Wait for them to send us an offer
        console.log('New peer joined:', peerId);
    });

    // Create a peer connection with all the handlers
    function createPeerConnection(peerId) {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        });

        // Store it in our map
        peerConnections.set(peerId, pc);

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    targetId: peerId,  // Send to specific peer
                    candidate: event.candidate
                });
            }
        };

        // Let them store it in their SvelteMap,
        //  and attach whatever else (eg .ontrack)
        on_pc({peerId,pc})

        return pc;
    }

    // When we receive an offer
    socket.on('offer', async ({ offer, offererId }) => {
        const pc = createPeerConnection(offererId);
        await pc.setRemoteDescription(offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', {
            targetId: offererId,  // Send answer back to peer who made offer
            answer
        });
    });

    // When we receive an answer
    socket.on('answer', async ({ answer, answererId }) => {
        const pc = peerConnections.get(answererId);
        await pc.setRemoteDescription(answer);
    });

    // When we receive an ICE candidate
    socket.on('ice-candidate', async ({ candidate, from }) => {
        const pc = peerConnections.get(from);
        await pc.addIceCandidate(candidate);
    });
}