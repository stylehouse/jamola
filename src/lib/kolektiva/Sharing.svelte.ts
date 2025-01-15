import { SvelteMap } from "svelte/reactivity";
import type { Participant } from "./Participants.svelte";


// inherited by Sharing, to hide the guts
//  may export to fancy up Peering's emit
class Caring {



    to

}
//#region *Listing
export class FileListing {
    name: string;
    size: number;
    modified: Date;
    
    constructor(init: Partial<FileListing>) {
        this.name = init.name;
        this.size = init.size;
        this.modified = init.modified instanceof Date ? init.modified : new Date(init.modified);
    }

    // Format size in human readable format (KB, MB, etc)
    get formattedSize(): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = this.size;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    // Format date in a readable way
    get formattedDate(): string {
        return this.modified.toLocaleString();
    }

    toJSON() {
        return {
            name: this.name,
            size: this.size,
            modified: this.modified.toISOString()
        };
    }
}
// many of the above
export class DirectoryListing {
    name?: string;
    files: FileListing[] = $state([])
    directories: DirectoryListing[] = $state([])
    constructor(init: Partial<DirectoryListing> = {}) {
        this.name = init.name
    }
    toJSON() {
        return {
            files: this.files,
            directories: this.directories
        };
    }
    static fromJSON(json: any): DirectoryListing {
        const listing = new DirectoryListing();
        listing.files = json.files.map(f => new FileListing(f));
        listing.directories = json.directories.map(d => new FileListing(d));
        return listing;
    }
}
// many of the above
export class CollectionListing {
}





//#region Sharing
type percentage = number
export class Sharing extends Caring {
    // leads back to party
    par:Participant
    tm:TransferManager
    private fsHandler = new FileSystemHandler()
    
    // < figure out how to do navigation and population
    // listings here + there
    localList: DirectoryListing | null = $state()
    remoteList: DirectoryListing | null = $state()
    remoteConsent = false;

    started = $state(false);

    constructor(opt) {
        super()
        Object.assign(this,opt)
        if (this.par.sharing_requested) {
            // they asked for it
            this.remoteConsent = true
            this.par.sharing_requested = false
        }
    }
    // we asked for it, they are now ready
    async consented() {
        if (this.remoteConsent) return
        this.remoteConsent = true
        await this.consented_acts()
    }
    async consented_acts() {
        await this.refresh_localList()
        await this.refresh_remoteList()
    }
    // then, maybe via ui,
    async start() {
        try {
            this.tm = new TransferManager({sharing:this})
            this.fsHandler = new FileSystemHandler();
            // consent by the user
            await this.fsHandler.start()
            // consent by the remote
            
            // < racey. Paring.unemit() should wait up to 3s for new handlers to arrive
            this.setupSharingHandlers(this.par)
            
            if (this.remoteConsent) {
                // this will let them know we are ready
                this.consented_acts()
            }
            else {
                // if you are first, this asks them to start
                this.send('sharing-ready',{})
                // make things look like they're working here
                //  but we'll do this again when they're ready
                await this.refresh_localList()
            }

            this.started = true;
            let say = this.remoteConsent ? " consentedly" : ""
            console.log(`File sharing started${say} with files:`, this.localList);
        } catch (err) {
            console.error("Failed to start file sharing:", err);
            throw err;
        }
    }
    async stop() {
        try {
            // Cancel any active transfers
            await this.tm.stop()

            // Clear file system state
            this.localList = null
            this.remoteList = null
            this.started = false;

            // Close any open file handles
            if (this.fsHandler) {
                await this.fsHandler.stop();
            }

            console.log("File sharing stopped");
        } catch (err) {
            console.error("Error during file sharing cleanup:", err);
            throw err;
        }
    }

    // make code in here nicer
    async send(type,data,options?) {
        return await this.par.ing.emit(type,data,options)
    }

//#region sendFile
    // Send a file from the filesystem
    async sendFile(
        filename: string,
        onProgress?: (progress: percentage) => void,
        seek = 0,
        fileId?
    ): Promise<void> {
        // for file-pull, they may already have a transfer object
        fileId ||= crypto.randomUUID();
        const reader = await this.fsHandler.getFileReader(filename);
        const transfer = this.tm.initTransfer('upload', fileId, filename, reader.size);
    
        // Send file metadata
        let meta = {
            fileId,
            name: filename,
            size: reader.size
        }
        if (seek) {
            meta.seek = seek
        }
        await this.send('file-meta', meta);

        // Read and send chunks
        try {
            for await (const chunk of reader.iterate(seek)) {
                await this.send('file-chunk',{
                    fileId,
                    buffer: chunk
                },{priority: 'low'});

                transfer.updateProgress(chunk.byteLength);
                onProgress?.(transfer.progress);
            }

            // Send completion message
            await this.send('file-complete',{
                fileId,
            })
            transfer.status = 'completed';
        } catch (err) {
            // < also following a lapse, esp if par.offline
            await transfer.error('sending: ' + err.message);
        }
    }

    // List available files
    async refresh_localList(): Promise<string[]> {
        this.localList = await this.fsHandler.listDirectory();
    }
    async refresh_remoteList() {
        try {
            await this.par.emit('file-list-request')
        } catch (err) {
            console.error('Error requesting remote file list:', err)
        }
    }
    // Watch for local file system changes
    async watchLocalChanges() {
        // Periodically check for changes
        this.watchLocal_interval = setInterval(async () => {
            try {
                let was = this.localList
                this.refresh_localList()
                if (JSON.stringify(was) !== JSON.stringify(this.localList)) {
                    // Notify remote peer of changes
                    await this.par.emit('file-list-response', { listing: this.localList })
                }
            } catch (err) {
                console.error('Error checking for file changes:', err)
            }
        }, 5000) // Check every 5 seconds
    }
//#region on
    setupSharingHandlers(par) {
        // every handler in here counts as consent
        let parhand = (name,callback) => {
            this.par.on(name, async (par,data) => {
                par.sharing.consented()
                await callback(data)
            })
        }

        // remote peer requesting our file list
        parhand('file-list-request', async () => {
            try {
                // < could be moving around
                let listing = this.localList
                await this.par.emit('file-list-response', {listing})
            } catch (err) {
                console.error('Error sending file list:', err)
            }
        })
        // receiving remote peer's file list
        // < data.directory:string[]
        parhand('file-list-response', async (data) => {
            this.remoteList = DirectoryListing.fromJSON(data.listing)
        })



        // Starts a new download
        // fyi, our PUT is just a file-meta someone receives
        parhand('file-meta', async (data) => {
            const transfer = this.tm.initTransfer(
                'download',
                data.fileId, 
                data.filename, 
                data.size
            );
            transfer.moved = data.seek || 0
            
            try {
                const writable = await this.fsHandler.writeFileChunks(data.filename);
                transfer.writable = writable;
                transfer.status = 'active';
            } catch (err) {
                transfer.status = 'error';
                console.error('Error starting file transfer:', err);
            }
        });
        // ...downloads
        parhand('file-chunk', async (data) => {
            const transfer = this.tm.transfers.get(data.fileId);
            if (!transfer || transfer.status !== 'active') {
                console.warn(`Invalid transfer state for chunk: ${data.fileId}`);
                return;
            }

            try {
                await transfer.writable.write(new Uint8Array(data.buffer));
                transfer.updateProgress(data.buffer.byteLength);
            } catch (err) {
                transfer.status = 'error';
                console.error('Error writing chunk:', err);
            }
        });
        // ...complete
        parhand('file-complete', async (data) => {
            const transfer = this.tm.transfers.get(data.fileId);
            if (!transfer) return;

            try {
                await transfer.writable.close();
                transfer.status = 'completed';
                this.tm.transfers.delete(data.fileId); // Clean up completed transfer
            } catch (err) {
                transfer.status = 'error';
                console.error('Error completing transfer:', err);
            }
        });
        // or do they
        parhand('file-error', async (data) => {
            const transfer = this.tm.transfers.get(data.fileId);
            if (!transfer) return;
            await transfer.error(data.error, false); // Don't notify back
        });
        // remote nabs
        parhand('file-pull', async (data) => {
            await this.sendFile(data.filename, undefined, data.seek, data.fileId);
        });
    }
}

// first user to enable Sharing asks the other to reciprocate
export function setupSharingCourtshipHandlers(par) {
    par.on('sharing-ready', async (data) => {
        if (par.sharing) {
            par.sharing.consented()
        }
        else {
            par.sharing_requested = true
        }
    });
}



//#region Transfer

// need individuating
type TransferType = 'upload' | 'download';
type TransferStatus = 'pending' | 'active' | 'paused' | 'completed' | 'error'
    | 'restarting'; // briefly before gone, replaced

class Transfer {
    // State
    moved: number = $state(0)    // Actual bytes transferred
    progress: number = $state(0)  // Percentage (0-100)
    status: TransferStatus = $state()
    error: string = $state('')

    // Metadata
    id: string
    type: TransferType
    filename: string
    size: number
    created_ts: Date = new Date();
    activity_ts: Date = new Date();
    
    // Services
    tm:TransferManager
    sharing:Sharing
    writable?: FileSystemWritableFileStream  // for downloads
    
    constructor(opt: Partial<Transfer>) {
        Object.assign(this,opt)
    }

    updateProgress(chunkBytes: number) {
        this.on_activity()
        this.moved += chunkBytes;
        this.progress = Math.round((this.moved / this.size) * 100);
    }
    on_activity() {
        this.activity_ts = new Date();
    }
    async error(msg: string, notify = true) {
        this.status = 'error';
        this.error = msg;
        if (notify) {
            await this.sharing.send('file-error', {
                fileId: this.id,
                error: msg
            });
        }
    }

    // restart somehow
    // < if we still have it?
    // < put in .incoming/
    async resume() {
        this.error = '';
        this.status = 'pending';
        // continuation from last byte
        await this.reinitiate({fileId:this.id,seek:this.moved})
    }
    // send some kind of message to restart somehow
    async reinitiate(opt={}) {
        opt.filename = this.filename
        if (this.type === 'download') {
            await this.sharing.send('file-pull', {
                filename: this.filename,
                fileId: this.id,
                seek: this.moved
            });
        } else {
            // the downloader would resume, usually
            //  but it helps to have communal ui that anyone (ish) can facilitate
            //   asking people for remote procedural clicking is naff
            await this.sharing.sendFile(this.filename, undefined, 0, this.id);
        }
    }
    async restart() {
        this.error = '';
        this.status = 'restarting';
        await this.stop()
        this.tm.remove(this)
        await this.reinitiate()
    }

    async stop() {
        if (this.writable) {
            try {
                await this.writable.close();
            } catch (err) {
                console.error('Error closing writable:', err);
            }
            this.writable = undefined;
        }
    }
}

class TransferManager {
    // parent
    sharing:Sharing
    
    constructor(opt: { sharing: Sharing }) {
        Object.assign(this,opt)
    }
    private transfers = $state(new SvelteMap<string, Transfer>());
    
    initTransfer(
        type: TransferType,
        id: string, 
        filename: string, 
        size: number
    ): Transfer {
        // they may have supplied an id that we already have, or the one they want
        let transfer = this.transfers.get(id);
        if (transfer) {
            // Transfer.resume() sanity
            if (transfer.type != type) throw "~type"
            if (transfer.filename != filename) throw "~filename"
            if (transfer.size != size) throw "~size"
        }
        else {
            transfer = new Transfer({
                type,
                id,
                filename,
                size,
                progress: 0,
                status: 'pending',
                tm: this,
                sharing: this.sharing
            });
            this.transfers.set(id, transfer);
        }

        transfer.on_activity()
        transfer.status = 'pending';

        return transfer;
    }
    remove(transfer) {
        this.transfers.delete(transfer.id)
    }
    async stop() {
        for (const transfer of this.transfers.values()) {
            await transfer.stop();
        }
        this.transfers.clear();
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



















//#region fs

interface FileReader {
    size: number;
    iterate: (startFrom?: number) => AsyncGenerator<ArrayBuffer>;
}

const CHUNK_SIZE = 16 * 1024;          // 16KB chunks for file transfer

type FileSystemDirectoryHandle = any
class FileSystemHandler {
    private _fs: FileSystemState = {
        dirHandle: FileSystemDirectoryHandle | null,
        fileHandles: Map<string, FileSystemFileHandle>,
    }
    constructor() {
        this._fs.fileHandles = new Map()
    }
    async start() {
        await this.requestDirectoryAccess()
    }
    async stop() {
        // Clear all stored handles
        this._fs.fileHandles.clear();
        this._fs.dirHandle = null;
    }

    
    // Request directory access from user
    // < permanent shares
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


    // go somewhere
    async getFileHandle(filename: string): Promise<FileSystemFileHandle> {
        if (!this._fs.dirHandle) {
            throw new Error('No directory access');
        }
        const handle = await this._fs.dirHandle.getFileHandle(filename);
        this._fs.fileHandles.set(filename, handle);
        return handle;
    }


    // List all files in the directory
    async listDirectory(): Promise<DirectoryListing> {
        if (!this._fs.dirHandle) throw new Error('No directory access');
        
        const listing = new DirectoryListing()
        // < tabulation?
        for await (const entry of this._fs.dirHandle.values()) {
            try {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    listing.files.push(new FileListing({
                        name: entry.name,
                        size: file.size,
                        modified: new Date(file.lastModified)
                    }));
                } else {
                    listing.directories.push(new DirectoryListing({
                        name: entry.name
                    }));
                }
            } catch (err) {
                console.warn(`Skipping problematic entry ${entry.name}:`, err);
            }
        }

        return listing;
    }

    // First get file info and iterator factory
    async getFileReader(filename: string, chunkSize = CHUNK_SIZE): Promise<FileReader> {
        if (!this._fs.dirHandle) {
            throw new Error('No directory access');
        }

        const fileHandle = await this._fs.dirHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        
        return {
            size: file.size,
            iterate: async function*(startFrom = 0) {
                let offset = startFrom;
                while (offset < file.size) {
                    // Read file in chunks
                    const chunk = file.slice(offset, offset + chunkSize);
                    yield await chunk.arrayBuffer();
                    offset += chunkSize;
                }
            }
        };
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






