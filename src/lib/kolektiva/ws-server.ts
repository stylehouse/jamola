import { Server } from 'socket.io'
import { writeFile, access, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
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
			//  saves inventing a concept to address individuals

			WebRTCSignalingServer(socket, io)

			AudioUploadServer(socket, io)
		});
	}
}

function AudioUploadServer(socket, io) {
	// Server-side receiving with acknowledgement
	socket.on('audio-upload', async (data, callback) => {
		try {
			const { metadata, audioData } = data;
			const filename = metadata.filename
			if (filename.match(/[^.\w/-]/)) {
				return callback({
					success: false,
					error: `filename is /[^\w/-]/`
				});
			}
			// Validate single forward slash requirement
			const slashCount = (filename.match(/\//g) || []).length;
			if (slashCount !== 1) {
				return callback({
					success: false,
					error: `filename must contain exactly one forward slash for directory structure`
				});
			}

			// Get directory path and ensure it's within uploads!
			const fullPath = join(UPLOAD_DIR, filename);
			const dirPath = dirname(fullPath);
			// Normalize paths for comparison to prevent directory traversal
			const normalizedPath = join(process.cwd(), fullPath);
			const uploadRoot = join(process.cwd(), UPLOAD_DIR);

			// Debug path information
			0 && console.log('Path debug:', {
				fullPath,
				normalizedPath,
				uploadRoot,
				cwd: process.cwd()
			});

			// Ensure path doesn't try to escape uploads directory
			if (!normalizedPath.startsWith(uploadRoot)) {
				return callback({
					success: false,
					error: 'Invalid path: attempting to write outside uploads directory'
				});
			}

			const metaFilename = filename.replace(/\.\w+$/, '.json');

			if (filename == metaFilename) {
				return callback({
					success: false,
					error: `filename should be /\.\w+$/, eg .webm`
				});
			}

			// Check if files already exist
			const fullMetaPath = join(UPLOAD_DIR, metaFilename);
			if (await fileExists(fullPath) || await fileExists(fullMetaPath)) {
				return callback({
					success: false,
					error: `file already exists`
				});
			}

			// Validate audioBlob before creating Buffer
			if (!audioData || !audioData.length) {
				throw new Error('Invalid audio blob data of length=' + audioData.length);
			}

			console.log(`audio-upload ${filename}`)

			// Save audio file
			// Create directory if it doesn't exist
			await mkdir(dirPath, { recursive: true });

			await writeFile(fullPath, Buffer.from(audioData));

			// Save metadata separately
			await writeFile(fullMetaPath, JSON.stringify(metadata, null, 2));

			return callback({
				success: true,
			});
		} catch (error) {
			console.error("Error in audio-upload",error)
			socket.emit('audio-upload-error', {
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



function WebRTCSignalingServer(socket, io) {
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

		peers.length && console.log('Other peers in ' + roomId + ': ', peers);
		socket.emit('peers-in-room', { peers });
	});

	// Handle SDP offer/answer exchange
	socket.on('offer', (data: { targetId: string, offer: RTCSessionDescription }) => {
		// console.log('offer',data.offer);
		socket.to(data.targetId).emit('offer', {
			offer: data.offer,
			offererId: socket.id
		});
	});

	socket.on('answer', (data: { targetId: string, answer: RTCSessionDescription }) => {
		// console.log('answer',data.answer);
		socket.to(data.targetId).emit('answer', {
			answer: data.answer,
			answererId: socket.id
		});
	});

	// Handle ICE candidate exchange
	socket.on('ice-candidate', (data: { targetId: string, candidate: RTCIceCandidate }) => {
		// console.log('candidate',data.candidate);
		socket.to(data.targetId).emit('ice-candidate', {
			candidate: data.candidate,
			from: socket.id
		});
	});
}
