import { untrack } from "svelte"
import { erring, throttle } from "../Y"
import type { Participant } from "../kolektiva/Participants.svelte"



// Convert linear amplitude to decibels
export function amplitudeToDB(amplitude: number): number {
    return 20 * Math.log10(Math.abs(amplitude));
}

// Convert decibels to linear amplitude
export function dbToAmplitude(db: number): number {
    return Math.pow(10, db / 20);
}

// Scale logarithmically, so smaller signals are more visible
// Adding 1 ensures we don't take log(0)
// Multiplying RMS by 10 spreads out the lower values
export function levelToVolumeLevel(level: number): number {
    return Math.min(Math.log10(1 + level * 10) / 1, 1);
}







type ParticipantWithEffects = {
    effects: AudioEffectoid[],
} & Participant
type AC = AudioContext
export type streamables = MediaStream|AudioEffectoid

//#region fec
// base class for all ./effects.svelte.ts
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

    // part of most input() schemes, along with check_wiring()
    usual_input(stream_or_node) {
        this.par = this.par.party.repar(this.par)
        this.disconnect_all_nodes()
        this.stream = stream_or_node
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
    get AC():AudioContext {
        return this.par.party.AC
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


//#region con
// lives in a fec.controls[]
// things get interactive
export class AudioControl {
    min = 0
    max = 2
    step = 0.05
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
    // how fast to adjust the value
    change_hz = 3
    get Knob_props() {
        // speed of slow
        let change_hz = this.change_hz ?? 3
        let propos = {
            min: this.min,
            max: this.max,
            step: this.step,
            change_hz,
            value: this.fec[this.fec_key],
            // < how to just do a bindable $value from here...
            //   it would need to come from and to this.*...
            // fast and slow
            slow: (value) => this.set(value),
            commit: (value) => this.commit(value),
        }
        console.log(`made props for fec:${this.fec.name} aka ${this.fec} con:${this.name} aka ${this}`);
            // < can't write this {this,propos} or big errors
            // {this:this,propos})
        return propos
    }

    get forever_key():Array<string|Object> {
        return [this.fec.par,this.fec,this]
    }

    set(value) {
        this.fec[this.fec_key] = value
        // may tell the *Node to adjust
        this.on_set?.(value)
        // tells config after adjustment is finished, via commit()
    }
    commit(value) {
        // value might be more recent that slow has given
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

