// Recorder class to manage recording state and chunks for each participant

import type { Socket } from "socket.io-client"
import type { SignalingClient } from "./ws-client.svelte"

export class parRecorder {
    par// = $state()
    uploadInterval_delta = 11 // seconds
    title:string
    title_ts:number
    bitrate:number
    i_par:Function
    Signaling:SignalingClient

    mediaRecorder:MediaRecorder = null
    recordedChunks = []
    uploadInterval:any = null

    // birthday of the recorder
    began_ts = Date.now()
    // this increases to the latest segmentation
    start_ts = null
    sequenceNumber = 0

    constructor(opt) {
        Object.assign(this,opt)
        if (this.title == null) {
            this.title = 'untitled'
        }
    }

    start(stream:MediaStream) {
        try {
            // reset per segment
            this.start_ts = Date.now();
            // see also began_ts, title_ts
            // Use high-quality audio encoding
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: this.bitrate * 1000,
            };
            
            this.mediaRecorder = new MediaRecorder(stream, options);
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    // these are 35kb chunks of webm.
                    this.recordedChunks.push(event.data);
                }
            };

            // Start periodic uploads
            this.uploadInterval = setInterval(() => {
                this.uploadCurrentSegment();
            }, this.uploadInterval_delta*1000);

            // Start recording
            // Request a new chunk every second for fine-grained recording
            this.mediaRecorder.start(1000);
        } catch (error) {
            console.error('Failed to start recording:', error);
        }
    }
    async uploadCurrentSegment() {
        if (this.reasons_to_avoid_segmentation()) {
            return
        }
        // to relocate a par. see "it seems like a svelte5 object proxy problem"
        let par = this.par
        par = this.par = this.i_par({par})
        console.log(`tape++ ${par.peerId}: ${par.name}   doing ${this.title}`)
        if (this.more_reasons_to_avoid_segmentation()) {
            return
        }

        // flush tape to blob
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.recordedChunks = []; // Clear for next segment
        // label (tuple)
        let rec = await this.make_rec_record(blob)
        
        await upload_recrecord(this.sock,{
            rec,
            good: () => {
                // console.log(`Uploaded ${rec.filename}`);
            },
            bad: (error) => {
                console.error('Failed to upload audio segment: '+error);
                // Store failed uploads for retry
                this.handleFailedUpload(rec);
            },
        })
    }
    async stop(abort) {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop_event
            this.mediaRecorder.stop();
            // this.requestData()
        }
        
        clearInterval(this.uploadInterval);
        
        // Final upload of any remaining data
        !abort && await this.uploadCurrentSegment();
        
        // Clear resources
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.uploadInterval = null;
    }

    async title_changed({title,title_ts}) {
        this.uploadCurrentSegment()
        this.title = title
        this.title_ts = title_ts
        this.sequenceNumber = 0
    }
    async bitrate_changed(bitrate) {
        this.uploadCurrentSegment()
        this.bitrate = bitrate
    }

    // assemble a labelled bit of tape!
    async make_rec_record(blob) {
        // this is probably too much data to collect
        let title_ts = this.title_ts
        let start_ts = this.start_ts
        let end_ts = this.start_ts = Date.now();
        // from a set of these filenames?
        const timestamp = new Date(title_ts).toISOString().replace(/[:.]/g, '-');
        const sanitizedName = (this.par.name+'').replace(/[^a-z\w0-9]/gi, '_');
        const sanitizedTitle = (this.title+'').replace(/[^a-z\w0-9]/gi, '_');
        let filename = `${timestamp}_${sanitizedTitle}_${sanitizedName}_${this.sequenceNumber}.webm`;
        let rec = {
            // < each peer's latency info...
            //  < listening to the different jitterbuggings of a loop
            //    depending on which peer experiencing it

            audio: blob,
            filename,
            // < observability of all this
            peerId: this.par.peerId,
            name: this.par.name,
            title: this.title,
            title_ts,
            start_ts,
            end_ts,
            sequenceNumber: this.sequenceNumber++,
        }
        return rec
    }
    reasons_to_avoid_segmentation() {
        // changing the title very early means keep it all
        let milliseconds = Date.now() - this.began_ts;
        if (milliseconds < 3300) return console.log("non-Segment: too soon"), 1;
        // 35k chunks of type=audio/webm
        if (this.recordedChunks.length < 1) return console.log("non-Segment: too tiny"), 1;

    }
    more_reasons_to_avoid_segmentation() {
        // sanity
        if (!this.par.name) {
            return console.warn(`non-Segment: no name`,this.par), 1
        }
        if (!this.title) return console.warn(`non-Segment: no title`), 1
            if (!this.title_ts) return console.warn(`non-Segment: no title_ts`), 1
        // < we can't seem to ensure that this par is in the current set of participants,
        //   it seems like a svelte5 object proxy problem. par!=this.par, yet par.pc==this.par.pc etc
        //   so don't worry about it
    }
    async handleFailedUpload(rec) {
        // Store failed upload in IndexedDB for retry
        try {
            const db = await openDB();
            const tx = db.transaction('failedUploads', 'readwrite');
            const store = tx.objectStore('failedUploads');
            
            await store.add({...rec})
            
        } catch (error) {
            console.error('Failed to store failed upload:', error);
        }
    }
}
// IndexedDB setup for failed uploads
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('audioRecordings', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('failedUploads')) {
                db.createObjectStore('failedUploads', { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
            }
        };
    });
}
// a par-agnostic uploader for the two ways to get here
// your layer on top of this decides what to do if upload goes bad
async function upload_recrecord(sock: () => Socket,{rec,good,bad}) {
    try {
        // Convert Blob to ArrayBuffer for transmission
        const arrayBuffer = await rec.audio.arrayBuffer();
        
        // Create metadata object (excluding the binary audio data)
        const metadata = {};
        for (let key in rec) {
            if (rec.hasOwnProperty(key) && key !== 'audio') {
                metadata[key] = rec[key];
            }
        }
        if (!sock()) {
            return bad("no sock")
        }
        
        sock().emit('audio-upload', {
            metadata,
            audioData: arrayBuffer
        }, (response) => {
            if (response.success) {
                good();
            } else {
                bad(response.error);
            }
        });

    } catch (error) {
        bad(error);
    }
}
// retry mechanism for failed uploads
export async function retryRecordingUploads(sock: () => Socket) {
    try {
        const db = await openDB();
        const tx = db.transaction('failedUploads', 'readwrite');
        const store = tx.objectStore('failedUploads');
        
        const getAllRequest = await store.getAll();
        // Wait for the request to complete
        const failedUploads = await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });

        if (!Array.isArray(failedUploads)) {
            console.log('No failed uploads to retry');
            return;
        }
        
        console.log(`Retrying ${failedUploads.length} failed uploads`);

        for (const rec of failedUploads) {
            await upload_recrecord(sock,{
                rec,
                good: async () => {
                    console.log(`Uploaded on retry: ${rec.filename}`);
                    // Remove successful upload from IndexedDB
                    await store.delete(upload.id);
                },
                bad: (error) => {
                    console.error('Failed to retry upload:', error);
                },
            })
        }
    } catch (error) {
        console.error('Failed to process upload retry queue:', error);
    }
}