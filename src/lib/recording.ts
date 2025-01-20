// Recorder class to manage recording state and chunks for each participant

import type { Socket } from "socket.io-client"
import { erring } from "./Y"
//
export class parRecorder {
    par// = $state()
    uploadInterval_delta = 11 // seconds
    title:string
    title_ts:number
    bitrate:number

    mediaRecorder:MediaRecorder = null
    recordedChunks = []
    uploadInterval:any = null
    // true while uploadCurrentSegment is about to have a batch of recordedChunks
    segmenting:boolean

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

    tape_in(stream:MediaStream) {
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
                    if (event.data.size < 33000 || event.data.size > 37000) {
                        // console.log("Recorder pushed "+event.data.size)
                    }
                    this.recordedChunks.push(event.data);
                }
                if (this.segmenting) {
                    // with the stop(),start() trick to make each piece playable,
                    //  we need to go and catch this event in the middle of segmenting
                    this.segmenting = false
                    this.segmenting_complete()
                }
            };
            // Start periodic uploads
            this.restart_uploadInterval()

            // Start recording
            // Request a new chunk every second for fine-grained recording
            this.mediaRecorder.start(1000);
        } catch (error) {
            throw erring('Failed to start recording:', error);
        }
    }
    
    restart_uploadInterval() {
        let delay = this.uploadInterval_delta*1000
        let uploadInterval_backwhenIwas = this.uploadInterval = setInterval(() => {
            if (uploadInterval_backwhenIwas != this.uploadInterval) {
                clearInterval(uploadInterval_backwhenIwas)
                return
            }
            // the usual place to do this, not via title change
            this.uploadCurrentSegment();
            this.next_upload_time = Date.now() + delay
        },delay);
        this.next_upload_time = Date.now() + delay
    }
    reasons_to_avoid_segmentation() {
        // changing the title very early means keep it all
        //  also that various things are changing it!?
        let milliseconds = Date.now() - this.began_ts;
        if (milliseconds < 3300) return console.log("non-Segment: too soon"), 1;
        // 35k chunks of type=audio/webm
        if (this.recordedChunks.length < 1) {
            return console.log("non-Segment: too tiny"), 1;
        }

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

    async uploadCurrentSegment(title_changing) {
        if (title_changing) {
            // title from peer, very early potentially...
            // no segment is too small to sync start_ts
            // pass this for debug info
            this.title_changing = true
        }   
        else {
            if (this.reasons_to_avoid_segmentation()) {
                return
            }
        }
        // it may be very short, but this.recordedChunks.length>0

        // to relocate a par. see "it seems like a svelte5 object proxy problem"
        let par = this.par
        par = this.par = this.party.repar(this.par)
        if (this.more_reasons_to_avoid_segmentation()) {
            return
        }

        // switch the recorder off and on.
        // < hopefully none of the stream is missing?
        if (this.is_rolling()) {
            // try to make each blob we get a webm-contained playable thing
            this.mediaRecorder.stop();
            this.mediaRecorder.start(1000);
        }
        else {
            // you must have hit stop() already
        }
        // wait for that last bit of data til now to drain...
        this.segmenting = true
        // this make have been customised but should now resume
        if (!this.uploadInterval) {
            this.restart_uploadInterval()
        }
    }
    is_rolling() {
        return this.mediaRecorder && this.mediaRecorder.state == 'recording'
    }
    // and resume segmenting afrom the data handler
    async segmenting_complete() {
        let let_go = () => {
            // .stop() lets us upload before spraying down with null
            this.onsegmented && this.onsegmented()
        }
        let title_changing = this.title_changing && ", title_changing" || ""
        this.title_changing = false
        if (this.recordedChunks.length < 1) {
            // tiny bit of time, nothing else came available
            console.warn("no-Segmented"+title_changing,this.recordedChunks);
            return let_go()
        }

        let par = this.par
        console.log(`tape++ ${par.name} - ${this.title}`)
        // flush tape to blob
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.recordedChunks = []; // Clear for next segment
        // label (tuple)
        let rec = await this.make_rec_record(blob)
        
        await upload_recrecord(this.sock,{
            rec,
            good: () => {
                // console.log(`Uploaded ${rec.filename}`);
                let_go()
            },
            bad: (error) => {
                console.error('audio-upload failed: '+error);
                // Store failed uploads for retry
                this.handleFailedUpload(rec);
                let_go()
            },
        })
        
    }
    async stop(let_go) {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            // https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop_event
            this.mediaRecorder.stop();
            // this.requestData()
        }
        
        // Final upload of any remaining data
        await this.uploadCurrentSegment();
        
        this.onsegmented = () => {
            this.uploadInterval && clearInterval(this.uploadInterval);
            // Clear resources
            this.mediaRecorder = null;
            this.recordedChunks = [];
            this.uploadInterval = null;
            // and those waiting for us to upload the last bit
            let_go && let_go()
        }
    }
    // used by title setters to sync everyone's segmenting start_ts
    // < check how bad sync it
    segment_time_left() {
        if (!this.next_upload_time) {
            console.error("No next_upload_time")
            // they take this to mean noop
            return 0
        }
        return Date.now() - this.next_upload_time
    }
    async title_changed({title,title_ts,sequenceNumber,time_left}) {
        this.uploadCurrentSegment()
        this.title = title
        this.title_ts = title_ts
        // titles from a peer also come with:
        this.sequenceNumber = sequenceNumber || 0
        if (time_left) {
            // sync the first segment's end time with that of the titler
            clearInterval(this.uploadInterval)
            delete this.uploadInterval
            setTimeout(() => {
                console.log("Segmenting due to title + time_left from peer")
                // we need to avoid any: non-Segment: too soon
                //  when we are 0.5s after page load and a title comes,
                this.uploadCurrentSegment('title_changing');
            },time_left)
        }
    }
    async bitrate_changed(bitrate) {
        console.log("Segmenting due to ~bitrate")
        this.uploadCurrentSegment()
        this.bitrate = bitrate
    }


    form_filename({title_ts,title,name,sequenceNumber}) {
        const timestamp = new Date(title_ts).toISOString().replace(/[:.]/g, '-');
        const sanitizedTitle = (this.title+'').replace(/[^a-z\w0-9]/gi, '_');
        const paddedSequenceNumber = String(sequenceNumber).padStart(4, '0');
        const sanitizedName = (this.par.name+'').replace(/[^a-z\w0-9]/gi, '_');
        return [
            // for an uploads/ full of date-titles
            timestamp, 
            sanitizedTitle
            +'/'+
            paddedSequenceNumber, 
            sanitizedName
        ].join('_') + '.webm';
    }

    // assemble a labelled bit of tape!
    async make_rec_record(blob) {
        // this is probably too much data to collect
        if (!this.start_ts) throw "!start"
        // from a set of these filenames?
        let filename = this.form_filename({
            title_ts: this.title_ts,
            title: this.title,
            name: this.par.name,
            sequenceNumber: this.sequenceNumber,
        })
        
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
            title_ts: this.title_ts,
            start_ts: this.start_ts,
            end_ts: (this.start_ts = Date.now()),
            sequenceNumber: this.sequenceNumber++,
        }
        return rec
    }

    async handleFailedUpload(rec) {
        // Store failed upload in IndexedDB for retry
        try {
            const db = await openDB();
            const tx = db.transaction('failedUploads', 'readwrite');
            const store = tx.objectStore('failedUploads');
            
            await store.add({...rec})
            
        } catch (error) {
            throw erring('Failed to store failed upload:', error);
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
        
        console.log(`audio-upload: retrying ${failedUploads.length} failed uploads`);

        for (const rec of failedUploads) {
            await upload_recrecord(sock,{
                rec,
                good: async () => {
                    console.log(`audio-upload: retry OK: ${rec.filename}`);
                    // Remove successful upload from IndexedDB
                    await store.delete(rec.id);
                },
                bad: async (error) => {
                    if (error.startsWith("file already exists")) {
                        console.error(`audio-upload: file exists: ${rec.filename}`);
                        await store.delete(rec.id);
                        return
                    }
                    throw erring('Failed to retry upload', error);
                },
            })
        }
    } catch (error) {
        throw erring('Failed to process upload retry queue', error);
    }
}