
type pubkey = string
type signat = string

// make 5 timestamps around now, 5 seconds apart
export function bunch_of_nowish() {
    let seconds = Math.floor(Date.now() / 1000)
    let t = Math.floor(seconds / 5) * 5
    return [t,t-5,t+5,t-10,t+10]

}
function sane_pub(pub) {
	if (typeof pub != 'string' || pub.length != 16) throw "!pub"
}
export function PeerilySignalingServer(socket, io) {
	socket.emit('hi')
	socket.on('sub', async ({pub}) => {
		sane_pub(pub)
		await socket.join(pub);
	})
	socket.on('pub', async ({pub,data}) => {
		sane_pub(pub)
		socket.to(pub).emit('pub', data);
	})
}