import { untrack } from "svelte"
import { throttle } from "./Y"








type ParticipantWithEffects = {
    effects: AudioEffectoid[],
}
type AC = AudioContext
export type streamables = MediaStream|AudioEffectoid


export abstract class AudioEffectoid {
    par:ParticipantWithEffects
    // the subclass name
    name:string
    
    // the foremost input to a thing
    stream:MediaStream|AudioNode
    output:MediaStream|AudioNode

    // subclasses must have an order
    // they have to define it in the call to super(opt)
    //  before calling get_wired_in, which needs order.
    // < wanting to define it in subclasses as a default, eg 'order = 30'
    //   but it seems to not get set until after the constructor() part of the object
    order:number
    // subclasses may have Knob.svelte for each:
    controls: AudioControl[]

    constructor(opt:{par}) {
        Object.assign(this,opt)

        this.name ||= this.constructor.name
        // to par.effects=[]
        this.get_wired_in()
    }
    toString() {
        return this.name
    }
    // < needs de-experimentalising
    input(stream) {
        this.par = this.par.party.repar(this.par)
        this.disconnect_all_nodes()
        this.stream = stream
        let clas = this.constructor.name
        // we convert between a transportable and effectable media here
        // < right?
        if (stream instanceof MediaStream) {
            if (clas != "FreshStream") debugger
            this.streamNode = this.AC.createMediaStreamSource(stream);
            // outputs a Node
            this.output = this.streamNode
        }
        else if (stream instanceof AudioNode) {
            if (clas != "CookedStream") debugger
            // in CookedStream, the signal becomes a transportable MediaStream again
            if (stream instanceof MediaStreamAudioSourceNode) {
                // if we have no other effects, this is Fresh -> Cooked
                //  it probably avoids decoding yet if we didn't .connect() anywhere
                console.log("No effects other than *Stream")
                this.output = this.stream.mediaStream
            }
            else if (stream instanceof MediaStreamAudioDestinationNode) {
                // < no effect would leave one of these as output
                //   they would be sidechaining to tape|call at the gain stage
                debugger
                this.outputNode ||= this.AC.createMediaStreamDestination()
                stream.connect(this.outputNode)
                this.output = this.outputNode.stream
            }
            else {
                this.output = stream.stream
                if (!this.output) {
                    // prep something to record from
                    this.outputNode ||= this.AC.createMediaStreamDestination()
                    stream.connect(this.outputNode)
                    this.output = this.outputNode.stream
                }
                stream.connect(this.AC.destination)
            }
        }
        else {
            throw "other stream: "+stream.constructor.name
        }
        // console.log(`The input of ${this.constructor.name} for ${this.par.name} stream: `,
        //     stream
        //     {
        //         id: stream.id,
        //         active: stream.active,
        //         tracks: stream.getTracks().map(track => ({
        //             kind: track.kind,
        //             enabled: track.enabled,
        //             muted: track.muted,
        //             readyState: track.readyState
        //         }))
        //     }
        // )


        // makes sure this leads somewhere, which can't be done without this.output made up?
        //  may set off a bunch more input() through par.effects
        this.check_wiring('just_did_input')
        
        // CookedStream uses this
        // as the final effect in the effects, elsewhere go
        this.on_output && this.on_output(this.output)
    }

    // all effects (besides the FreshStream, which is MediaStream)
    //  connect an AudioNode input from the previous one
    //  to the given first Node in their sub-graph
    input_to_Node(stream,Node) {
        this.disconnect_all_nodes()

        if (stream instanceof MediaStream) {
            throw "This is supposed to be AudioNode by now"
        }
        else if (stream instanceof AudioNode) {
            // a connection between effects
            stream.connect(Node)
        }
        else {
            throw "other stream: "+stream.constructor.name
        }
        // shall be the first node
        this.stream = stream
    }
    // and a given last node
    output_Node(Node) {
        this.output = Node
    }


    // 2.input(1) along par.effect.* until 1.output == 2.stream
    // may cause .input(stream) from one to the next along par.effects = []
    check_wiring(just_did_input) {
        // < in such a way that completes par.effects, once
        let {fore,aft} = this.get_wired_in()
        console.log(`------ ${this.par} ${fore?.constructor?.name} -> ${this.constructor?.name} -> ${aft?.constructor?.name}`)
        
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
        let party = this.par.party
        let AC = party.audioContext ||= new AudioContext()
        // will resume playback once unsuspended
        // < test this
        // < what does "no audio data is lost" mean and how should we approach catch up on being behind the ideal 20ms or so latency
        if (AC.state === 'suspended') {
            party.wants_audio_permission = async () => {
                await AC.resume()
                if (AC.state === 'suspended') {
                    throw "still suspended after wants_audio_permission"
                }
                delete party.wants_audio_permission
            }
        }
        if (!AC) throw "!AC"
        return AC
    }
    disconnect_all_nodes(and_null?) {
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
        this.disconnect_all_nodes('and_null')
    }
}
// < detangle these's implementations from AudioEffectoid?
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


// things get interactive
class AudioControl {
    min = 0
    max = 2
    step = 0.025
    name?:string
    // where value resides on the parent
    fec_key:string
    fec:AudioEffectoid
    constructor(opt) {
        Object.assign(this,opt)
        this.name ||= this.fec_key || "qua"
    }
    toString() {
        return this.name
    }
    get Knob_props() {
        let propos = {
            min: this.min,
            max: this.max,
            step: this.step,
            value: this.fec[this.fec_key],
            // < how to just do a bindable $value from here...
            //   it would need to come from and to this.*...
            feed: (value) => {
                this.set(value)
            },
        }
        console.log(`made props for fec:${this.fec.name} aka ${this.fec} con:${this.name} aka ${this}`,
            // < can't write this {this,propos} or big errors
            {this:this,propos})
        return propos
    }

    get forever_key():Array<string|Object> {
        return [this.fec.par,this.fec,this]
    }
    set(value) {
        this.fec[this.fec_key] = value
        // may tell the *Node to adjust
        this.on_set?.(value,this.fec_key)
        // tell config
        this.fec.par.party.set_forever(this.forever_key,value)
    }
    // may remember this setting
    read_config() {
        let v = this.fec.par.party.get_forever(this.forever_key)
        if (v != null) {
            this.set(v)
            this.ui_version++
        }
    }
    // bump to resync ui from our state
    //  we are working on values we can't assume are $state()
    //  but hardly need to read from unless we re-read_config()
    // you should not be calling Knob_props too often
    ui_version = $state(1)
}

// Stream buffering or slight time travels
export class Delaysagne extends AudioEffectoid {
    delay = 1 // ms
    constructor(opt) {
        super({order:666, ...opt})
        this.controls = [
            new AudioControl({
                fec: this,
                fec_key: 'delay',
                max: 2200,
                step: 10,
                unit: 'ms',
                on_set:() => this.set_delay(),
            })
        ]

        this.delayNode = this.AC.createDelay(5);
    }
    input(stream) {
        this.input_to_Node(stream,this.delayNode)
        
        this.set_delay()

        this.output_Node(this.delayNode)

        // Go on inputting
        this.check_wiring('just_did_input')
    }
    set_delay() {
        this.delayNode.delayTime.setValueAtTime(this.delay / 1000, this.AC.currentTime);
    }

    // < basically where to do speed-up and slow-down to adjust stream buffer|latency?
}





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
                fec_key: 'gainValue',
                name: 'gain',
                on_set:() => this.set_gain(),
            })
        )
        this.gainNode = this.AC.createGain();
        this.gainNode.gain.value = 0.85;
    }

    // Set gain level
    set_gain() {
        // < this shouldn't fire so much (too reactive)
        // console.log(`${this.par} ${this.name} gain twid ${this.gainValue}`)
        this.gainNode.gain.setValueAtTime(this.gainValue, this.AC.currentTime);
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
    // looks at the signal after gaining
    private analyserNode: AnalyserNode | null = null;

    // Stores to track volume and peak levels
    public volumeLevel = $state(0);
    public peakLevel = $state(0);

    private dataArray: Uint8Array;
    private bufferLength: number;
    private meterUpdateId: number

    constructor(opt) {
        super({order:12, ...opt})
        this.Gainorator_init()
    }

    Gainorator_init() {
        this.init_gain()
        this.gainNode.gain.value = 1;

        // Create analyser node for metering
        this.analyserNode = this.AC.createAnalyser();
        this.analyserNode.fftSize = 2048;
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
            
            // Calculate RMS volume
            let sum = 0;
            for (let i = 0; i < this.bufferLength; i++) {
                const value = (this.dataArray[i] - 128) / 128;
                sum += value * value;
            }
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
            }, 150)
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

// gain with metering
export class AutoGainorator extends Gainorator {
    // Tracking gain adjustments and state
    private targetPeakLevel = -9; // Target peak level in dB
    private silenceThreshold = -50; // dB threshold for silence
    private gainAdjustmentRate = 0.1; // Gentle gain adjustment speed
    private stableTime = 0; // Time spent near target level
    private lastAdjustmentTime = 0;
    private stabilizationPeriod = 3000; // 3 seconds to stabilize
    private maxGain = 10; // Prevent excessive amplification
    private minGain = 0.1; // Prevent complete silence

    constructor(opt) {
        super(opt);
        if (!this.name) {
            console.error(`didn't call the AudioEffectoid constructor for ${this.par} `)
        }
        this.gainNode.gain.value = 1; // Start with unity gain
    }

    // hook into super|Gainorator.startMetering()
    meterings = 0
    on_metering() {
        // Gain adjustment logic
        if (meterings % 1000) {
            console.log("Did AutoGainorator.on_metering!")
        }
        this.adjustGain();
    }
    private adjustGain() {
        // AI says:
        //  performance.now() provides a high-resolution timestamp
        //   relative to the page load, measuring wall clock time.
        //   It's not affected by system clock changes and continues
        //   to increase even when the page is inactive
        //   or the system is sleeping
        //  this.AC.currentTime is of the audio context. It starts
        //   at zero when the context is created and advances in 
        //   real-time, but only when the audio context is in the
        //   "running" state.
        //  The latter may stutter or pause relative to the former,
        //   if tab is inactive (!running), audio processing
        //   interruptions, heavy load.
        //   
        const currentTime = performance.now();
        const peakDB = amplitudeToDB(this.peakLevel);

        // Calculate needed gain adjustment
        const targetAmplitude = dbToAmplitude(this.targetPeakLevel);
        const currentGain = this.gainNode.gain.value;
        
        // Silence detection
        if (peakDB < this.silenceThreshold) {
            // If signal is very low, don't amplify
            return;
        }

        // Calculate gain needed to reach target
        let newGain = currentGain * (targetAmplitude / this.peakLevel);
        
        // Smooth out gain changes
        newGain = currentGain + (newGain - currentGain) * this.gainAdjustmentRate;
        
        // Clamp gain to prevent extreme amplification
        newGain = Math.max(this.minGain, Math.min(newGain, this.maxGain));

        // Update gain
        this.gainNode.gain.setValueAtTime(newGain, this.AC.currentTime);
        
        // Track stabilization
        if (Math.abs(peakDB - this.targetPeakLevel) < 1) {
            this.stableTime += currentTime - this.lastAdjustmentTime;
        } else {
            this.stableTime = 0;
        }

        this.lastAdjustmentTime = currentTime;

        // Emergency loudness catch
        if (peakDB > 0) {
            // Rapid gain reduction if clipping occurs
            this.gainNode.gain.setValueAtTime(
                Math.max(currentGain * 0.5, this.minGain), 
                this.AC.currentTime
            );
        }
    }

}

// Convert linear amplitude to decibels
function amplitudeToDB(amplitude: number): number {
    return 20 * Math.log10(Math.abs(amplitude));
}

// Convert decibels to linear amplitude
function dbToAmplitude(db: number): number {
    return Math.pow(10, db / 20);
}

// Scale logarithmically, so smaller signals are more visible
// Adding 1 ensures we don't take log(0)
// Multiplying RMS by 10 spreads out the lower values
function levelToVolumeLevel(level: number): number {
    return Math.min(Math.log10(1 + level * 10) / 1, 1);
}

