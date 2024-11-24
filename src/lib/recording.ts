// Recorder class to manage recording state and chunks for each participant
export class parRecorder {
    par// = $state()
    constructor({par, uploadIntervalMs = 5000, title, bitrate, i_par}) { // 30 second default
        this.par = par;
        this.i_par = i_par;
        this.title = title == null ? 'untitled' : title
        this.bitrate = bitrate
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.uploadInterval = null;
        this.uploadIntervalMs = uploadIntervalMs;
        // this increases to the latest segmentation
        this.began_ts = Date.now();
        // this increases to the latest segmentation
        this.start_ts = null;
        this.sequenceNumber = 0;
    }

    start(stream) {
        try {
            // Use high-quality audio encoding
            const options = {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 270000
            };
            
            this.mediaRecorder = new MediaRecorder(stream, options);
            // reset per segment
            this.start_ts = Date.now();
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            // Start periodic uploads
            this.uploadInterval = setInterval(() => {
                this.uploadCurrentSegment();
            }, this.uploadIntervalMs);

            // Start recording
            // Request a new chunk every second for fine-grained recording
            this.mediaRecorder.start(1000);
            
            console.log(`Started recording for ${this.par.name}`);
        } catch (error) {
            console.error('Failed to start recording:', error);
        }
    }
    async stop(abort) {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        clearInterval(this.uploadInterval);
        
        // Final upload of any remaining data
        !abort && await this.uploadCurrentSegment();
        
        // Clear resources
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.uploadInterval = null;
    }

    async title_changed(title) {
        this.uploadCurrentSegment()
        this.title = title
    }
    async bitrate_changed(bitrate) {
        this.uploadCurrentSegment()
        this.bitrate = bitrate
    }

    // assemble a labelled bit of tape!
    async make_recrecord(blob) {
        // so we can hopefully stitch them back together
        let start_ts = this.start_ts
        let end_ts = this.start_ts = Date.now();
        // from a set of these filenames?
        const timestamp = new Date(start_ts).toISOString().replace(/[:.]/g, '-');
        const sanitizedName = this.par.name.replace(/[^a-z\w0-9]/gi, '_');
        const sanitizedTitle = this.title.replace(/[^a-z\w0-9]/gi, '_');
        let filename = `${timestamp}_${sanitizedTitle}_${sanitizedName}_${this.sequenceNumber}.webm`;
        let rec = {
            audio: blob,
            audio_filename: filename,
            peerId: this.par.peerId,
            name: this.par.name,
            title: this.title,
            start_ts,
            end_ts,
            sequenceNumber: this.sequenceNumber++,
        }
        return rec
    }
    
    async uploadCurrentSegment() {
        // changing the title very early means keep it all
        let milliseconds = Date.now() - this.began_ts;
        if (milliseconds < 3300) return console.log("non-Segment: too soon");
        // 35k chunks of type=audio/webm
        if (this.recordedChunks.length < 1) return console.log("non-Segment: too tiny");
        // sanity
        let par = this.par
        let still = this.i_par({peerId:par.peerId})
        let fail = 0
        if (par != still) {
            if (!still.name) {
                console.warn("No still.name")
            }
            par = this.par = still
        }
        console.log(`tape++ ${par.peerId}: ${par.name}   doing ${this.title}`)
        let name = this.par.name;
        if (!par.name) {

            return console.warn(`non-Segment: no name (after ${milliseconds}ms)`,par,still,par==still)
        }
        if (!this.title) return console.warn(`non-Segment: no title`)
        // < we can't seem to ensure that this par is in the current set of participants,
        //   it seems like a svelte5 object proxy problem. par!=this.par, yet par.pc==this.par.pc etc
        //   so don't worry about it

        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.recordedChunks = []; // Clear for next segment

        let rec = await this.make_recrecord(blob)
        
        await upload_recrecord({
            rec,
            good: () => {
                console.log(`Uploaded ${rec.audio_filename}`);
            },
            bad: (error) => {
                console.error('Failed to upload audio segment: '+error);
                // Store failed uploads for retry
                this.handleFailedUpload(rec);
            },
        })
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
// your layer on top of this decides what to do if upload goes bad
async function upload_recrecord({rec,good,bad}) {
    // Create form data for upload https://developer.mozilla.org/en-US/docs/Web/API/FormData/append
    const formData = new FormData();
    let with_filename = {}
    for (let key in rec) {
        if (rec.hasOwnProperty(key)) {
            if (rec.hasOwnProperty(key+'_filename')) {
                with_filename[key] = rec[key+'_filename']
            }
        }
    }
    for (let key in rec) {
        if (rec.hasOwnProperty(key)) {
            if (key.endsWith('_filename')) {
                continue
            }
            let value = rec[key];
            let filename = with_filename[key]
            if (filename != null) {
                formData.append(key,value,filename);
            }
            else {
                // < TEST can we filename=null it, not branch here?
                formData.append(key,value);
            }
        }
    }

    try {
        const response = await fetch('/api/upload-audio', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            bad(`Error ${response.status}: ${response.statusText}`)
        }
        else {
            good()
        }

    } catch (error) {
        bad(error)
    }
}
// retry mechanism for failed uploads
export async function retryRecordingUploads() {
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
            await upload_recrecord({
                rec,
                good: async () => {
                    console.log(`Uploaded on retry: ${rec.audio_filename}`);
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