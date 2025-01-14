import type { Participant } from "./Participants.svelte";


// inherited by Sharing, to hide the guts
//  may export to fancy up Peering's emit
class Caring {
    // Set up buffer management on channel creation
    setupDataChannelHandlers(channel: RTCDataChannel) {
        channel.bufferedAmountLowThreshold = LOW_WATER_MARK;
        
        channel.onbufferedamountlow = () => {
            this._paused = false;
            this._processQueue();
        };
    }





}

export class Sharing extends Caring {
    // leads back to party
    par:Participant
    private fsHandler: FileSystemHandler;
    // navigation and population
    dir
    list = $state()

    constructor(opt) {
        super()
        Object.assign(this,opt)
    }
    // via ui, we begin:
    async start() {
        this.fsHandler = new FileSystemHandler();
        this.setupDataChannelHandlers(this.par.ing.channel);
        await this.setupFileSystem()
        this.started = true
        this.list = this.listAvailableFiles()
    }

    // Send a file from the filesystem
    async sendFileFromFS(filename: string, onProgress?: (progress: number) => void): Promise<void> {
        const fileId = crypto.randomUUID();
        let totalSent = 0;

        // Send file metadata
        await this.send(JSON.stringify({
            type: 'file-meta',
            fileId,
            name: filename
        }), { priority: 'high' });

        // Read and send chunks
        try {
            for await (const chunk of this.fsHandler.readFileChunks(filename)) {
                await this.send(chunk, {
                    maxBuffered: MAX_BUFFERED_AMOUNT,
                    priority: 'normal'
                });

                totalSent += chunk.byteLength;
                onProgress?.(totalSent);
            }

            // Send completion message
            await this.send(JSON.stringify({
                type: 'file-complete',
                fileId
            }), { priority: 'high' });
        } catch (err) {
            console.error('Error sending file:', err);
            throw err;
        }
    }

    // Receive a file to the filesystem
    async receiveFileToFS(
        fileId: string,
        filename: string,
        onProgress?: (progress: number) => void
    ): Promise<void> {
        try {
            const writable = await this.fsHandler.writeFileChunks(filename);
            let totalReceived = 0;

            const handleChunk = async (chunk: ArrayBuffer) => {
                await writable.write(new Uint8Array(chunk));
                totalReceived += chunk.byteLength;
                onProgress?.(totalReceived);
            };

            // Set up event listener for chunks
            this.on('file-chunk', async (data) => {
                if (data.fileId === fileId) {
                    await handleChunk(data.chunk);
                }
            });

            // Set up completion handler
            this.on('file-complete', async (data) => {
                if (data.fileId === fileId) {
                    await writable.close();
                }
            });
        } catch (err) {
            console.error('Error receiving file:', err);
            throw err;
        }
    }

    // List available files
    async listAvailableFiles(): Promise<string[]> {
        return this.fsHandler.listFiles();
    }

    // Request directory access
    async setupFileSystem(): Promise<void> {
        await this.fsHandler.requestDirectoryAccess();
    }
}


// eg, whole, not streaming chunks:
//   // Read and write files in the directory
//   async function workWithFiles(dirHandle) {
//     // Create/write a file
//     const newFileHandle = await dirHandle.getFileHandle('recording.wav', { create: true });
//     const writable = await newFileHandle.createWritable();
//     await writable.write(audioData);
//     await writable.close();
  
//     // Read a file
//     const fileHandle = await dirHandle.getFileHandle('recording.wav');
//     const file = await fileHandle.getFile();
//     const contents = await file.arrayBuffer();
//   }


// Constants for buffer management
const MAX_BUFFERED_AMOUNT = 64 * 1024; // 64KB for general data
const MAX_AUDIO_BUFFERED = 16 * 1024;  // 16KB for audio - lower to reduce latency
const CHUNK_SIZE = 16 * 1024;          // 16KB chunks for file transfer
const LOW_WATER_MARK = MAX_BUFFERED_AMOUNT * 0.8; // Start sending again at 80%

// Extend Paring class with buffer management
class Paring {
    private _sendQueue: Array<{
        data: Uint8Array,
        resolve: () => void,
        reject: (error: Error) => void
    }> = [];
    private _paused = false;

    constructor() {
        // ... existing constructor code ...
    }


    // Enhanced send method with buffer management
    async send(data: ArrayBuffer | string, options: { 
        maxBuffered?: number, 
        priority?: 'high' | 'normal' | 'low' 
    } = {}) {
        const { maxBuffered = MAX_BUFFERED_AMOUNT, priority = 'normal' } = options;

        if (!this.channel || this.channel.readyState !== 'open') {
            throw new Error('Channel not ready');
        }

        // Convert string to ArrayBuffer if needed
        const buffer = typeof data === 'string' ? 
            new TextEncoder().encode(data) : 
            new Uint8Array(data);

        // Check if we need to queue
        if (this.channel.bufferedAmount > maxBuffered) {
            this._paused = true;
            return new Promise((resolve, reject) => {
                this._sendQueue.push({ data: buffer, resolve, reject });
                
                // Sort queue by priority if needed
                if (priority === 'high') {
                    this._sendQueue.sort((a, b) => 
                        (a.data['priority'] === 'high' ? -1 : 1));
                }
            });
        }

        this.channel.send(buffer);
    }

    // Process queued messages
    private _processQueue() {
        while (!this._paused && this._sendQueue.length > 0) {
            const { data, resolve } = this._sendQueue.shift()!;
            
            try {
                this.channel!.send(data);
                resolve();
                
                if (this.channel!.bufferedAmount > MAX_BUFFERED_AMOUNT) {
                    this._paused = true;
                    break;
                }
            } catch (err) {
                console.error('Error sending queued data:', err);
            }
        }
    }

    // File transfer with progress handling
    async sendFile(file: File, onProgress?: (progress: number) => void): Promise<void> {
        const fileId = crypto.randomUUID();
        const chunks = Math.ceil(file.size / CHUNK_SIZE);
        let sent = 0;

        // Send file metadata first
        await this.send(JSON.stringify({
            type: 'file-meta',
            fileId,
            name: file.name,
            size: file.size,
            chunks
        }), { priority: 'high' });

        // Send file chunks
        for (let i = 0; i < chunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = await file.slice(start, end).arrayBuffer();

            await this.send(chunk, { 
                maxBuffered: MAX_BUFFERED_AMOUNT,
                priority: 'normal'
            });

            sent += chunk.byteLength;
            onProgress?.(sent / file.size);
        }

        // Send completion message
        await this.send(JSON.stringify({
            type: 'file-complete',
            fileId
        }), { priority: 'high' });
    }

    // Audio buffer management - use smaller buffer for lower latency
    async sendAudioData(audioData: ArrayBuffer) {
        return this.send(audioData, { 
            maxBuffered: MAX_AUDIO_BUFFERED,
            priority: 'high'
        });
    }
}

// Example file receiver implementation
class FileReceiver {
    private chunks: Map<string, Array<ArrayBuffer>> = new Map();
    private metadata: Map<string, {
        name: string,
        size: number,
        chunks: number
    }> = new Map();

    handleFileData(message: any) {
        if (message.type === 'file-meta') {
            this.metadata.set(message.fileId, {
                name: message.name,
                size: message.size,
                chunks: message.chunks
            });
            this.chunks.set(message.fileId, []);
        }
        else if (message.type === 'file-chunk') {
            const fileChunks = this.chunks.get(message.fileId);
            if (fileChunks) {
                fileChunks[message.index] = message.data;
                
                // Calculate and emit progress
                const meta = this.metadata.get(message.fileId);
                if (meta) {
                    const progress = fileChunks.filter(Boolean).length / meta.chunks;
                    this.emit('progress', message.fileId, progress);
                }
            }
        }
        else if (message.type === 'file-complete') {
            this.assembleFile(message.fileId);
        }
    }

    private assembleFile(fileId: string) {
        const chunks = this.chunks.get(fileId);
        const meta = this.metadata.get(fileId);
        
        if (chunks && meta) {
            const blob = new Blob(chunks, { type: 'application/octet-stream' });
            this.emit('file-complete', fileId, blob, meta.name);
            
            // Cleanup
            this.chunks.delete(fileId);
            this.metadata.delete(fileId);
        }
    }

    // Example event emitter implementation
    private emit(event: string, ...args: any[]) {
        // Implement your event emission logic
    }
}






















// FileSystem handling extension for Paring class
interface FileSystemState {
    dirHandle: FileSystemDirectoryHandle | null;
    fileHandles: Map<string, FileSystemFileHandle>;
}

class FileSystemHandler {
    private _fs: FileSystemState = {
        dirHandle: null,
        fileHandles: new Map()
    };

    // Request directory access from user
    async requestDirectoryAccess(): Promise<FileSystemDirectoryHandle> {
        try {
            const dirHandle = await window.showDirectoryPicker({
                mode: 'readwrite'
            });
            this._fs.dirHandle = dirHandle;
            return dirHandle;
        } catch (err) {
            console.error('Error accessing directory:', err);
            throw err;
        }
    }

    // List all files in the directory
    async listFiles(): Promise<string[]> {
        if (!this._fs.dirHandle) {
            throw new Error('No directory access');
        }

        const files: string[] = [];
        for await (const entry of this._fs.dirHandle.values()) {
            if (entry.kind === 'file') {
                files.push(entry.name);
            }
        }
        return files;
    }

    // Read file in chunks
    async* readFileChunks(filename: string, chunkSize = CHUNK_SIZE): AsyncGenerator<ArrayBuffer> {
        if (!this._fs.dirHandle) {
            throw new Error('No directory access');
        }

        const fileHandle = await this._fs.dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const total = file.size;
        let offset = 0;

        while (offset < total) {
            const chunk = file.slice(offset, offset + chunkSize);
            yield await chunk.arrayBuffer();
            offset += chunkSize;
        }
    }

    // Write file in chunks
    async writeFileChunks(filename: string): Promise<FileSystemWritableFileStream> {
        if (!this._fs.dirHandle) {
            throw new Error('No directory access');
        }

        const fileHandle = await this._fs.dirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        this._fs.fileHandles.set(filename, fileHandle);
        return writable;
    }
}






