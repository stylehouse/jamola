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

type dirlisting = {dir:string[],fil:string[]}
export class Sharing extends Caring {
    // leads back to party
    par:Participant
    private fsHandler: FileSystemHandler;
    private fileListeners: Map<string, Function[]> = new Map();
    private activeTransfers: Set<string> = new Set();
    // navigation and population
    dir: FileSystemDirectoryHandle | null = null;
    list: dirlisting | null = $state()
    started = $state(false);
    tm = new TransferManager();

    constructor(opt) {
        super()
        Object.assign(this,opt)
    }
    // then, maybe via ui,
    async start() {
        try {
            this.fsHandler = new FileSystemHandler();
            this.setupDataChannelHandlers(this.par.ing.channel);
            this.list = await this.listAvailableFiles();
            this.started = true;
            console.log("File sharing started with files:", this.list);
        } catch (err) {
            console.error("Failed to start file sharing:", err);
            throw err;
        }
    }
    async stop() {
        try {
            // Cancel any active transfers
            for (const transferId of this.activeTransfers) {
                await this.cancelTransfer(transferId);
            }

            // Remove all file listeners
            this.fileListeners.clear();
            this.activeTransfers.clear();

            // Clear file system state
            this.dir = null;
            this.list = [];
            this.started = false;

            // Close any open file handles
            if (this.fsHandler) {
                await this.fsHandler.closeAllHandles();
            }

            console.log("File sharing stopped");
        } catch (err) {
            console.error("Error during file sharing cleanup:", err);
            throw err;
        }
    }

    // make code in here nicer
    async send(type,data,options) {
        return this.par.ing.emit(type,data,options)
    }
    // create|replaces a per-par handler for this message type
    on(type,handler) {
        this.ing.par.on(type,handler)
    }

    // Send a file from the filesystem
    async sendFile(
        filename: string,
        onProgress?: (progress: number) => void
    ): Promise<void> {
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
    async receiveFile(
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
        return this.fsHandler.listDirectory();
    }

}


//#region Transfer
// need individuating
class Transfer {
    id: string
    filename: string
    size: number
    progress: number = $state()
    status: 'pending' | 'active' | 'paused' | 'completed' | 'error'
    started: Date
    // < don't hold on to all of these?
    chunks: Set<number>
    constructor(opt) {
        Object.assign(this,opt)
    }
}

class TransferManager {
    private transfers = $state(new Map<string, Transfer>());
    
    initTransfer(id: string, filename: string, size: number): Transfer {
        const transfer = new Transfer({
            id,
            filename,
            size,
            progress: 0,
            status: 'pending',
            started: new Date(),
            chunks: new Set()
        });
        this.transfers.set(id, transfer);
        return transfer;
    }

    updateProgress(id: string, chunkIndex: number, chunkSize: number) {
        const transfer = this.transfers.get(id);
        if (!transfer) return;
        
        transfer.chunks.add(chunkIndex);
        transfer.progress = (transfer.chunks.size * chunkSize / transfer.size) * 100;
    }
}

















//#region ->Peering

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
export class BufferedParing {
    private _sendQueue: Array<{
        data: Uint8Array,
        resolve: () => void,
        reject: (error: Error) => void
    }> = [];
    private _paused = false;

    constructor() {
    }

    // < replaces emit
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
}





















//#region FileSystemHandler
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
    // go somewhere
    async getFileHandle(filename: string): Promise<FileSystemFileHandle> {
        if (!this._fs.dirHandle) {
            throw new Error('No directory access');
        }
        const handle = await this._fs.dirHandle.getFileHandle(filename);
        this._fs.fileHandles.set(filename, handle);
        return handle;
    }
    async closeAllHandles() {
        // Clear all stored handles
        this._fs.fileHandles.clear();
        this._fs.dirHandle = null;
    }

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
    async listDirectory(): Promise<DirectoryListing> {
        if (!this._fs.dirHandle) throw new Error('No directory access');
        
        const listing: DirectoryListing = {files: [], directories: []};
        
        for await (const entry of this._fs.dirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                listing.files.push({
                    name: entry.name,
                    size: file.size,
                    modified: new Date(file.lastModified)
                });
            } else {
                listing.directories.push(entry.name);
            }
        }
        return listing;
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






