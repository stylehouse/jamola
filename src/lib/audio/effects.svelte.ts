


import { erring } from "$lib/Y";
import { AudioEffectoid,AudioControl,levelToVolumeLevel, dbToAmplitude, amplitudeToDB } from "./audio.svelte";


//#region in, up, out
// these three effects are important pieces of app functionality
// relating to the audio changing formats as it goes places
export class FreshStream extends AudioEffectoid {
    constructor(opt) {
        super({order:0, ...opt})
    }
    // we convert between a transportable and effectable media here
    // < check that, cpu saving?
    input(stream) {
        this.usual_input(stream)
        if (stream instanceof MediaStream) {
            this.streamNode = this.AC.createMediaStreamSource(stream);
            // outputs a Node
            this.output = this.streamNode
        }
        this.check_wiring('just_did_input')
    }
}

// make a MediaStream, for streaming itself
export class Transmit extends AudioEffectoid {
    null = 1 // ms
    constructor(opt) {
        super({order:7, ...opt})
        this.controls = [
            new AudioControl({
                fec: this,
                fec_key: 'null',
                max: 1,
                step: 1,
                unit: 'bool',
                on_set:(v,hz) => this.set_null(v,hz),
            }),
        ]
    }
    input(stream) {
        this.usual_input(stream)

        if (stream instanceof AudioNode) {
            // this thing doesn't allow connections from it
            this.outputNode ||= this.AC.createMediaStreamDestination()
            stream.connect(this.outputNode)
            // but provides a .stream to record or transmit
            this.transmission = this.outputNode.stream

            // < proactively check that gets picked up in have_output() within 400ms?
        }
        else {
            throw erring(`Transmit type ${stream}`)
        }

        // and simply pass thing along
        this.output = stream
        this.check_wiring('just_did_input')
    }
    set_null(v) {
        if (v) {
            // < yoink the streams from...
        }
        else {
            // < publish the streams to certain par...
        }
        console.log(`Transmit? ${v}`)
    }
}

export class CookedStream extends AudioEffectoid {
    constructor(opt) {
        super({order:999, ...opt})
    }
    outputNode ?:AudioNode
    input(stream) {
        this.usual_input(stream)
        if (stream instanceof AudioNode) {
            // nobody needs a stream from Cooked since Transmit
            // a node   (of our own, wrt disconnect_all_nodes)
            //  to connect to AC.destination
            // < do we ever get here without also going to par.have_output()
            // a Gain is the most generic type of AudioNode
            this.outputNode ||= this.AC.createGain(stream);
            stream.connect(this.outputNode)
        }
        else if (stream instanceof MediaStream) {
            // the only effect?
            this.output = stream
            // make able to connect to AC.destination
            this.outputNode = this.AC.createMediaStreamSource(stream);
        }
        else {
            throw erring("CookedStream type "+stream)
        }
        // makes sure this leads somewhere, which can't be done without this.output made up?
        //  may set off a bunch more input() through par.effects
        // < how far does it need to go? til a remembered *Node is found?
        this.check_wiring('just_did_input')

        // elsewhere go
        this.par.have_output(this)
    }
}


//#region Delay
// Stream buffering or slight time travels
export class Delaysagne extends AudioEffectoid {
    delay = 1 // ms
    hz = 16 // change_hz, how fast to move towards that delay
    constructor(opt) {
        super({order:666, ...opt})
        this.controls = [
            new AudioControl({
                fec: this,
                fec_key: 'delay',
                max: 2200,
                step: 10,
                unit: 'ms',
                on_set:(v,hz) => this.set_delay(v,hz),
            }),
            new AudioControl({
                fec: this,
                fec_key: 'hz',
                max: 6.28,
                step: 0.05,
                unit: 'hz',
                on_set:(v,hz) => this.set_hz(v,hz),
            }),            
        ]

        this.delayNode = this.AC.createDelay(5);
    }
    input(stream) {
        this.input_to_Node(stream,this.delayNode)
        
        this.set_delay(this.delay)

        this.output_Node(this.delayNode)

        // Go on inputting
        this.check_wiring('just_did_input')
    }
    set_hz(v) {
        this.hz = v
    }
    set_delay(v,hz=5) {
        hz ||= 0.0001
        this.delayNode.delayTime.linearRampToValueAtTime(
            v / 1000, // ms -> s
            this.AC.currentTime + 1/hz // hz -> s
        );
    }

    // < basically where to do speed-up and slow-down to adjust stream buffer|latency?
}




//#region Gains
// thing with gain ness
export class AudioGainEffectoid extends AudioEffectoid {
    // < what is this supposed to be? -23dB?
    public gainValue = $state(0.85);

    gainNode: GainNode | null = null;
    // < got "super not a function" error if we super() all the way up this subtyping
    init_gain() {
        (this.controls ||= []).push(
            new AudioControl({
                fec: this,
                max: this.max,
                fec_key: 'gainValue',
                name: 'gain',
                on_set:(v,hz) => this.set_gain(v,hz),
            })
        )
        this.gainNode = this.AC.createGain();
        this.gainNode.gain.value = 1;
    }

    // Set gain level
    set_gain(v,hz=5) {
        hz ||= 0.0001
        // < this shouldn't fire so much (too reactive)
        this.gainNode.gain.linearRampToValueAtTime(
            v,
            this.AC.currentTime + 1/hz // hz -> s
        );
    }
}

// gain
// used as a final fader on the mix end of the chain
// deciding how much of everything we want,
//  rather than where is a clear level to record at
export class Gaintrol extends AudioGainEffectoid {
    constructor(opt) {
        super({order:8, ...opt})
        this.init_gain()
    }

    // Process incoming audio stream
    input(stream: MediaStream) {
        this.input_to_Node(stream,this.gainNode)

        this.output = this.gainNode

        // Go on inputting
        this.check_wiring('just_did_input')
    }
}

// gain with metering
export class Gainorator extends AudioGainEffectoid {
    // goes way up
    max = 12;
    // looks at the signal after gaining
    private analyserNode: AnalyserNode | null = null;

    // Stores to track volume and peak levels
    public volumeLevel = $state(0);
    public peakLevel = $state(0);

    private dataArray: Uint8Array;
    private bufferLength: number;
    private meterUpdateId: number
    signal_sample = $state();

    constructor(opt) {
        super({order:12, ...opt})
        this.Gainorator_init()
    }

    Gainorator_init() {
        this.init_gain()

        // Create analyser node for metering
        this.analyserNode = this.AC.createAnalyser();
        this.analyserNode.fftSize = 32;
        this.bufferLength = this.analyserNode.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);
    }

    // Process incoming audio stream
    input(stream: MediaStream) {
        this.input_to_Node(stream,this.gainNode)

        this.gainNode.connect(this.analyserNode);

        // this.output_Node(this.analyserNode)
        this.output = this.gainNode

        // Start metering
        this.startMetering();
        // Go on inputting
        this.check_wiring('just_did_input')
    }

    // Start continuous volume metering
    // < centralise all timery things
    private startMetering() {
        cancelAnimationFrame(this.meterUpdateId);
        const meterUpdate = () => {
            if (!this.analyserNode) return
            cancelAnimationFrame(this.meterUpdateId);

            // Get volume data
            this.analyserNode.getByteTimeDomainData(this.dataArray);
            this.signal_sample = this.dataArray.slice(0,8)

            // Calculate RMS volume
            if (this.dataArray.length != this.bufferLength) throw "lengths"
            let sum = 0;
            Array.from(this.dataArray).map(value => {
                value = (value - 128) / 128
                sum += value * value
            })
            const rms = Math.sqrt(sum / this.bufferLength);
            
            // Update volume level (0-1 range)
            // Raw RMS calculation typically produces values between 0 and ~0.5
            // Multiplying by 2 stretches this to a 0-1 range, which is more useful for UI representation
            let level = Math.min(rms * 2, 1);
            // Scale logarithmically, so smaller signals are more visible
            this.volumeLevel = levelToVolumeLevel(level)

            // Check for peak (clipping)
            const peak = Math.max(...this.dataArray) / 255;
            this.peakLevel = peak;

            // < Check for low entropy, eg all bytes are 127
            // to the AutoGainorator subclass
            this.on_metering?.()

            setTimeout(() => {
                // Continue metering
                this.meterUpdateId = requestAnimationFrame(meterUpdate);
            }, 250)
        };
        this.meterUpdateId = requestAnimationFrame(meterUpdate);
    }


    destroy() {
        // Call base class destroy to handle node disconnection
        super.destroy();
    
        // Stop metering animation
        cancelAnimationFrame(this.meterUpdateId);
    
        // Reset internal state
        this.volumeLevel = 0;
        this.peakLevel = 0;
        this.gainValue = 1;
    }
}

//#region autogain
// gain with self-turning knob
export class AutoGainorator extends Gainorator {
    // Tracking gain adjustments and state
    targetPeakLevel = -4; // Target peak level in dB
    private silenceThreshold = -50; // dB threshold for silence

    private gainUpRate = 0.02; // Slow gain increase
    private gainDownRate = 0.3; // Fast gain decrease
    private stableTime = 0; // Time spent near target level
    private lastAdjustmentTime = 0;
    private stabilizationPeriod = 3000; // 3 seconds to stabilize

    // stretch of time to remember the signal being loud
    private memoryQueue: Array<{peakDB: number, timestamp: number}> = []; 
    memoryTime = 12; // how long ago

    private maxGain = 10; // Prevent excessive amplification
    private minGain = 0.1; // Prevent complete silence

    constructor(opt) {
        super({order:13, ...opt})
        if (!this.name) throw erring(`didn't call the AudioEffectoid constructor for ${this.par}`)
        
        this.controls.push(
            new AudioControl({
                fec: this,
                min: -42,
                max: 19,
                fec_key: 'targetPeakLevel',
                name: 'target',
                on_set:(v,hz) => this.set_gain(v,hz),
            }),
            new AudioControl({
                fec: this,
                min: 0,
                max: 22,
                fec_key: 'mem',
                name: 'memoryTime',
                on_set:(v,hz) => this.set_gain(v,hz),
            }),
        )
        this.gainNode.gain.value = 1; // Start with unity gain
    }

    // Process incoming audio stream, to the analyser first
    //  ie we analyse what we haven't played with
    input(stream: MediaStream) {
        this.input_to_Node(stream,this.analyserNode)

        this.analyserNode.connect(this.gainNode);

        // this.output_Node(this.analyserNode)
        this.output = this.gainNode

        // Start metering
        this.startMetering();
        // Go on inputting
        this.check_wiring('just_did_input')
    }

    // hook into super|Gainorator.startMetering()
    meterings = 0
    on_metering() {
        // Gain adjustment logic
        if (!this.meterings++ % 11) {
            console.log("Did 11 AutoGainorator.on_metering! ")
        }
        this.adjustGain();
    }

    private cleanMemoryQueue() {
        const currentTime = performance.now();
        const cutoffTime = currentTime - this.memoryTime;
        
        // Remove entries older than memoryTime
        while (this.memoryQueue.length > 0 && this.memoryQueue[0].timestamp < cutoffTime) {
            this.memoryQueue.shift();
        }
        
        // If queue is still too long, remove two oldest entries
        if (this.memoryQueue.length > this.memoryTime / 100) { // Rough estimate of max reasonable entries
            this.memoryQueue.shift();
            this.memoryQueue.shift();
        }
    }

    private getRecentMaxPeak(): number {
        if (this.memoryQueue.length === 0) return -Infinity;
        return Math.max(...this.memoryQueue.map(entry => entry.peakDB));
    }
    
    private adjustGain() {
        const currentTime = performance.now();
        const peakDB = amplitudeToDB(this.peakLevel);

        // Add current peak to memory queue
        this.memoryQueue.push({peakDB, timestamp: currentTime});
        this.cleanMemoryQueue();

        // Calculate needed gain adjustment
        const targetAmplitude = dbToAmplitude(this.targetPeakLevel);
        const currentGain = this.gainNode.gain.value;
        
        // Silence detection
        if (peakDB < this.silenceThreshold) {
            console.log(`🔇 SILENCE: ${peakDB.toFixed(2)}dB - SKIPPING`);
            return;
        }

        // Check recent memory for loud signals
        const recentMaxPeak = this.getRecentMaxPeak();
        const shouldConsiderMemory = recentMaxPeak > this.targetPeakLevel;
        
        // Use recent max if it's louder than current and above target
        const effectivePeak = shouldConsiderMemory ? 
            Math.max(peakDB, recentMaxPeak) : peakDB;
        const effectivePeakAmplitude = dbToAmplitude(effectivePeak);

        // Calculate ideal gain
        let newGain = currentGain * (targetAmplitude / this.peakLevel);
        
        // Determine if we're turning gain up or down
        const needsReduction = effectivePeak > this.targetPeakLevel;
        const adjustmentRate = needsReduction ? this.gainDownRate : this.gainUpRate;
        
        // Apply asymmetric smoothing
        const smoothedGain = currentGain + (newGain - currentGain) * adjustmentRate;
        newGain = smoothedGain;
        
        // Clamp gain to safe limits
        newGain = Math.max(this.minGain, Math.min(newGain, this.maxGain));

        console.log(`🎚️ ${needsReduction ? '📉 DOWN' : '📈 UP'}: ${currentGain.toFixed(3)} → ${newGain.toFixed(3)} | Peak: ${peakDB.toFixed(1)}dB | Memory: ${recentMaxPeak.toFixed(1)}dB`);

        // Update gain
        if (this.controls[0].name != 'gain') throw "!con:gain"
        this.controls[0].push(newGain)
        
        // Track stabilization
        const errorDB = Math.abs(effectivePeak - this.targetPeakLevel);
        if (errorDB < 1) {
            this.stableTime += currentTime - this.lastAdjustmentTime;
        } else {
            this.stableTime = 0;
        }

        this.lastAdjustmentTime = currentTime;

        // Emergency loudness protection
        if (peakDB > 0) {
            const emergencyGain = Math.max(currentGain * 0.3, this.minGain);
            console.log(`🚨 EMERGENCY! Peak ${peakDB.toFixed(2)}dB - CUTTING to ${emergencyGain.toFixed(4)}`);
            this.gainNode.gain.setValueAtTime(emergencyGain, this.AC.currentTime);
        }
    }
}