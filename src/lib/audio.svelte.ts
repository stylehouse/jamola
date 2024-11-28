







type ParticipantWithEffects = {
    effects: AudioEffectoid[],
}
type AC = AudioContext
export type streamables = MediaStream|AudioEffectoid


export abstract class AudioEffectoid {
    par:ParticipantWithEffects
    // the foremost input to a thing
    stream:MediaStream
    output:MediaStream
    audioContext = new AudioContext()
    constructor(opt:{par,stream}) {
        Object.assign(this,opt)
    }
    input(stream) {
        // this is the behaviour of the *Stream objects
        // simply places, so we can rewire anything anywhere between them
        this.output = this.stream = stream
        // makes sure this leads somewhere, which can't be done without this.output made up?
        //  may set off a bunch more input() through par.effects
        this.check_wiring()
    }

    // may cause .input(stream) from one to the next along par.effects = []
    check_wiring() {
        // < in such a way that completes par.effects, once
        let {fore,aft} = this.get_wired_in(this.par)
        // we only have our abstract notion of par.effects, that we must sync to:
        if (fore) {
            // source side of this, output side of that
            if (fore.output != this.stream) {
                console.log(`wiring ${fore} into ${this}`)
                return this.input(fore.output)
            }
        }
        if (aft) {
            // vise versa
            if (aft.stream != this.output) {
                console.log(`wiring ${this} into ${aft}`)
                return aft.input(this.output)
            }
        }
    }
    // get realised in the chain of audio processors on par.effects
    get_wired_in(par) {
        par.effects ||= []
        // card trick crud
        let fore = []
        while (par.effects[0] && par.effects[0].order < this.order) {
            if (par.effects[0] == effect) {
                par.effects.shift();
                continue
            }
            fore.push(par.effects.shift())
        }
        // the spot
        let aft = par.effects[0]
        par.effects.unshift(...fore,effect)
        fore = fore.slice(-1)[0]
        return {fore,aft}
    }
    get AC {
        let AC = this.par.audioContext
        if (!AC) throw "!AC"
        return AC
    }
}
export class FreshStream extends AudioEffectoid {
    order = 0
}
export class CookedStream extends AudioEffectoid {
    order = 999
    on_output = Function
    input(stream) {
        super(stream)
        // as the final effect in the effects, elsewhere go
        this.on_output(stream)
    }
}

// Stream buffering or slight time travels
export class Delaysagne extends AudioEffectoid {
    order = 22
    delay = 500 // ms
    input(stream: MediaStream) {
        this.sourceNode = this.AC.createMediaStreamSource(stream);
        this.delayNode = this.AC.createDelay(5);
        
        delayNode.delayTime.setValueAtTime(this.delay / 1000, this.AC.currentTime);
        
        this.sourceNode
            .connect(this.delayNode)
            .connect(
                this.output = this.AC.createMediaStreamDestination()
            );

        // Go on inputting
        this.check_wiring()
    }

    // would it be where to do this?
    adjustStreamTiming(speed: number = 1.0) {
        let par = this.par
        if (!par.audio || !par.audio.srcObject) return;

        // For more advanced timing manipulation
        const audioElement = par.audio;
        if ('playbackRate' in audioElement) {
            audioElement.playbackRate = speed;
        }
    }
}

export class Gainorator extends AudioEffectoid {
    order = 22
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private gainNode: GainNode | null = null;
    private analyserNode: AnalyserNode | null = null;
    
    // Stores to track volume and peak levels
    public volumeLevel = $state(0);
    public peakLevel = $state(0);
    public gainValue = $state(1);

    private dataArray: Uint8Array;
    private bufferLength: number;

    constructor(opt) {
        super(opt)
        
        // Create analyser node for metering
        this.analyserNode = this.AC.createAnalyser();
        this.analyserNode.fftSize = 2048;
        this.bufferLength = this.analyserNode.frequencyBinCount;
        this.dataArray = new Uint8Array(this.bufferLength);

        // Create gain node
        this.gainNode = this.AC.createGain();
        this.gainNode.gain.value = 1;
    }

    // Process incoming audio stream
    input(stream: MediaStream) {
        // Clean up any existing connections
        this.disconnect();

        // Create source node from stream
        this.sourceNode = this.AC.createMediaStreamSource(stream);

        this.sourceNode
            .connect(this.gainNode)
            .connect(this.analyserNode)
            .connect(
                this.output = this.AC.createMediaStreamDestination()
            );

        // Start metering
        this.startMetering();
        // Go on inputting
        this.check_wiring()
    }

    // Start continuous volume metering
    private startMetering() {
        const meterUpdate = () => {
            // Get volume data
            this.analyserNode.getByteTimeDomainData(this.dataArray);
            
            // Calculate RMS volume
            let sum = 0;
            for (let i = 0; i < this.bufferLength; i++) {
                const value = (this.dataArray[i] - 128) / 128;
                sum += value * value;
            }
            const rms = Math.sqrt(sum / this.bufferLength);
            
            // Update volume level (0-1 range)
            this.volumeLevel = Math.min(rms * 2, 1);

            // Check for peak (clipping)
            const peak = Math.max(...this.dataArray) / 255;
            this.peakLevel = peak;

            // Continue metering
            requestAnimationFrame(meterUpdate);
        };

        meterUpdate();
    }

    // Set gain level
    setGain(value: number) {
        if (this.gainNode) {
            // Limit gain to prevent distortion
            const clampedGain = Math.min(Math.max(value, 0), 2);
            this.gainNode.gain.setValueAtTime(clampedGain, this.audioContext.currentTime);
            this.gainValue = clampedGain;
        }
    }

    // Disconnect all audio nodes
    disconnect() {
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
    }

    // Cleanup method
    destroy() {
        this.disconnect();
        this.audioContext.close();
    }
}