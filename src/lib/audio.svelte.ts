







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

    // subclasses must have an order
    // they have to define it in the call to super(opt)
    //  before calling get_wired_in, which needs order.
    // < wanting to define it in subclasses as a default, eg 'order = 30'
    //   but it seems to not get set until after the constructor() part of the object
    order:number

    constructor(opt:{par,stream}) {
        Object.assign(this,opt)
        // to par.effects=[]
        this.get_wired_in()
    }
    input(stream) {
        // this is the behaviour of the *Stream objects
        // simply places, so we can rewire anything anywhere between them
        this.stream = stream
        // more here, eventually presenting
        this.output = this.stream

        // makes sure this leads somewhere, which can't be done without this.output made up?
        //  may set off a bunch more input() through par.effects
        this.check_wiring('just_did_input')
        
        // CookedStream uses this
        // as the final effect in the effects, elsewhere go
        this.on_output && this.on_output(stream)
    }

    stream_to_Node(stream) {
        this.stream = stream
        return this.streamNode = this.AC.createMediaStreamSource(stream);
    }
    Node_to_output(Node) {
        this.outputNode = this.AC.createMediaStreamDestination()
        Node.connect(this.outputNode)
        this.output = this.outputNode.stream
    }
    // check if we need to input() this stream
    is_streaming_this(stream) {
        if (stream == this.stream) {
            // as above
            return 1
        }
        if (stream == this.stream && this.stream.mediaStream) {
            // processor nodes want this made into a node as well, so...
            // < is it much more efficient to have only all the nodes connecting
            //   and only mediastream at the very ends of par.effects?
            return 1
        }
    }

    // may cause .input(stream) from one to the next along par.effects = []
    check_wiring(just_did_input) {
        // < in such a way that completes par.effects, once
        let {fore,aft} = this.get_wired_in()
        // console.log(`------ ${fore?.constructor?.name} -> ${this.constructor?.name} -> ${aft?.constructor?.name}`)
        
        // we only have our abstract notion of par.effects, that we must sync to:
        if (fore && fore.output) {
            // source side of this, output side of that
            if (this.stream != fore.output) {
                // console.log(`wiring ${fore.constructor.name} into ${this.constructor.name}`)
                if (just_did_input) {
                    debugger
                }
                return this.input(fore.output)
            }
        }
        if (aft && this.output) {
            // vise versa
            if (this.output != aft.stream) {
                // console.log(`wiring ${this.constructor.name} into ${aft.constructor.name}`)
                return aft.input(this.output)
            }
        }
    }
    // get realised in the chain of audio processors on par.effects
    get_wired_in() {
        let par = this.par
        par.effects ||= []
        let effects = par.effects
        if (this.order == null) debugger
        // card trick crud
        let fore = []
        while (par.effects[0] && par.effects[0].order+'' < this.order+'') {
            fore.push(par.effects.shift())
        }
        if (par.effects[0] == this) {
            // supposing we have unique orders
            par.effects.shift();
        }
        // the spot
        let aft = par.effects[0]
        par.effects.unshift(this)
        par.effects.unshift(...fore)
        fore = fore.slice(-1)[0]
        return {fore,aft}
    }
    get AC() {
        let AC = this.par.audioContext
        if (!AC) throw "!AC"
        return AC
    }
    disconnect_all_nodes(and_null) {
        // Find and disconnect all properties ending with 'Node'
        Object.keys(this)
            .filter(key => key.endsWith('Node') && this[key] instanceof AudioNode)
            .forEach(key => {
                try {
                    this[key].disconnect();
                    if (and_null) {
                        this[key] = null;
                    }
                } catch (error) {
                    console.warn(`Error disconnecting ${key}:`, error);
                }
            });

    }
    destroy() {
        disconnect_all_nodes('and_null')
    }
}
export class FreshStream extends AudioEffectoid {
    constructor(opt) {
        super({order:0, ...opt})
    }
}
export class CookedStream extends AudioEffectoid {
    constructor(opt) {
        super({order:999, ...opt})
    }
    on_output = Function
}

// Stream buffering or slight time travels
export class Delaysagne extends AudioEffectoid {
    delay = 500 // ms
    constructor(opt) {
        super({order:666, ...opt})
    }
    input(stream: MediaStream) {
        this.disconnect_all_nodes()
        this.stream_to_Node(stream).connect(this.delayNode)
        
        this.delayNode = this.AC.createDelay(5);
        
        this.delayNode.delayTime.setValueAtTime(this.delay / 1000, this.AC.currentTime);
        
        this.Node_to_output(this.delayNode)

        // Go on inputting
        this.check_wiring('just_did_input')
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
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private gainNode: GainNode | null = null;
    private analyserNode: AnalyserNode | null = null;

    // Stores to track volume and peak levels
    public volumeLevel = $state(0);
    public peakLevel = $state(0);
    public gainValue = $state(1);

    private dataArray: Uint8Array;
    private bufferLength: number;
    private meterUpdateId: number

    constructor(opt) {
        super({order:12, ...opt})
        
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
        this.disconnect_all_nodes()
        this.stream_to_Node(stream).connect(this.gainNode)
        this.gainNode.connect(this.analyserNode);
        this.Node_to_output(this.analyserNode)

        // Start metering
        this.startMetering();
        // Go on inputting
        this.check_wiring('just_did_input')
    }

    // Start continuous volume metering
    private startMetering() {
        const meterUpdate = () => {
            cancelAnimationFrame(this.meterUpdateId);
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
            this.meterUpdateId = requestAnimationFrame(meterUpdate);
        };
        this.meterUpdateId = requestAnimationFrame(meterUpdate);
    }

    // Set gain level
    setGain(value: number) {
        if (this.gainNode) {
            // Limit gain to prevent distortion
            const clampedGain = Math.min(Math.max(value, 0), 2);
            this.gainNode.gain.setValueAtTime(clampedGain, this.AC.currentTime);
            this.gainValue = clampedGain;
        }
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