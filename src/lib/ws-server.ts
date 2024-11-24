import { Server } from 'socket.io'
import { writeFile, access } from 'fs/promises';
import { join } from 'path';
import { constants } from 'fs';

const UPLOAD_DIR = 'uploads'

export const webSocketServer = {
	name: 'webSocketServer',
	configureServer(server: ViteDevServer) {
		if (!server.httpServer) return

		const io = new Server(server.httpServer)

		io.on('connection', async (socket) => {
			console.log('Client connected:', socket.id);
			// < proxy is not passing external addresses
			// console.log('Client address:', socket.handshake);

			// socket.id is its own room, becomes targetId

			SignalingServer(socket,io)

			UploadServer(socket,io)
		});
	}
}

function UploadServer(socket,io) {
	// Server-side receiving with acknowledgement
	socket.on('audio-upload', async (data,callback) => {
		try {
		  const { metadata, audioData } = data;
		  const filename = metadata.filename;
		  const metaFilename = filename.replace(/\.\w+$/, '.json');
		  
		  if (filename == metaFilename) {
			return callback({
				success: false,
				error: `filename should be /\.\w+$/, eg .webm`
			});
		  }

		  // checks
		  if (await fileExists(metaFilename)) {
			  return callback({
				  success: false,
				  error: `metaFilename already exists`
			  });
		  }
		  if (await fileExists(filename)) {
			  return callback({
				  success: false,
				  error: `filename already exists`
			  });
		  }

		  // Validate audioBlob before creating Buffer
		  if (!audioData || !audioData.length) {
			throw new Error('Invalid audio blob data of length='+audioData.length);
		  }
		  
		  console.log(`audio-upload ${filename}`)
		  
		  // Save audio file
		  await writeFile(
			join(UPLOAD_DIR, filename),
			Buffer.from(audioData)
		  );
		  
		  // Save metadata separately
		  await writeFile(
			join(UPLOAD_DIR, metaFilename),
			JSON.stringify(metadata, null, 2)
		  );
		  
		  return callback({
			success: true,
		  });
		} catch (error) {
		  console.error(error)
		  socket.emit('upload-error', { 
			error: error.message,
			filename: data?.metadata?.filename 
		  });
		}
	  });
}
async function fileExists(path) {
    try {
        await access(path, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}



function SignalingServer(socket,io) {
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
}
