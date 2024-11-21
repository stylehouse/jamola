import { Server } from 'socket.io'
export const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) {
		if (!server.httpServer) return

		const io = new Server(server.httpServer)

		io.on('connection', async (socket) => {
			console.log('Client connected:', socket.id);
			// console.log('Client address:', socket.handshake);

			// is its own room, becomes targetId
			// await socket.join(socket.id);

			// When a peer joins a room
			socket.on('join-room', async (roomId: string) => {
				// Let everyone in the room know about the new peer
				socket.to(roomId).emit('peer-joined', {
					peerId: socket.id
				});

				await socket.join(roomId);

				// Get list of all other peers in the room
				const peers = Array.from(await io.in(roomId).fetchSockets())
					.map(peer => peer.id)
					.filter(id => id != socket.id)
				
				peers.length && console.log('Other peers in '+roomId+': ', peers);
				socket.emit('peers-in-room', {peers});
			});

			// Handle SDP offer/answer exchange
			socket.on('offer', (data: { targetId: string, offer: RTCSessionDescription }) => {
				socket.to(data.targetId).emit('offer', {
					offer: data.offer,
					offererId: socket.id
				});
			});

			socket.on('answer', (data: { targetId: string, answer: RTCSessionDescription }) => {
				socket.to(data.targetId).emit('answer', {
					answer: data.answer,
					answererId: socket.id
				});
			});

			// Handle ICE candidate exchange
			socket.on('ice-candidate', (data: { targetId: string, candidate: RTCIceCandidate }) => {
				socket.to(data.targetId).emit('ice-candidate', {
					candidate: data.candidate,
					from: socket.id
				});
			});
		});
	}
}
