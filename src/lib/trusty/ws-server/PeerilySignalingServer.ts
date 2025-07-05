
type pubkey = string
type signat = string

export function bunch_of_nowish() {
    let seconds = Math.floor(Date.now() / 1000)
    let t = Math.floor(seconds / 5) * 5
    return [t,t-5,t+5,t-10,t+10]

}
export function PeerilySignalingServer(socket, io) {
	// When a peer joins a room, but with a token say:
	socket.on('nab', async ({from,to,sig_nowish}) => {
        if (to && sig_nowish) {
            // one of these will fit sign:
            
            // < make timestamps each fromnow from now
            //    rounded to 5secondses
        }


        


		// Let everyone in the room know about the new peer
		socket.to(roomId).emit('peer-joined', {
			peerId: socket.id
		});

		await socket.join(roomId);

		// Get list of all other peers in the room
		const peers = Array.from(await io.in(roomId).fetchSockets())
			.map(peer => peer.id)
			.filter(id => id != socket.id)

		peers.length && console.log('Other peers in ' + roomId + ': ', peers);
		socket.emit('peers-in-room', { peers });
	});
}