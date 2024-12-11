<script lang="ts">
    import { onDestroy, tick } from "svelte";

	// < gestures to step up|down scale...
	//	  a C to the bottom 1/10, where the top of the previous range was
    //   so Knob can be used for any number, ie guessing min|max
	//  < sideways going to components beside this one, with surface tensions
	// < pending value, actually set on release
	//    alternative props that set value and imply when (how streamingly) you want it changed
	//    a sale is more stable than a value, right?
	// < feeding a function to show the pending value
	//    as a colour space explorer, make bluenoise|phi pointilism glow
	let {
		value=$bindable(5),

		// < callbacks|bindables to feed values while twiddling
		//    commit to value itself on release
			feed,
			// < debounce 50ms?
			slow,
			// idiomatic?
			valued=$bindable(),

		// drag distance of range
		//  300px seems good, can be done in either direction by a relaxed hand
		space = 300,
		// how much value changes over the given space
		range = 20,
		// optional limits to value
		// doesn't imply range (as was deprecated)
		//  eg, if these were range*2 apart, you'd drag by space*2 to go between
		min,
		max,

		// how finely you notch the range
		//  step=0.001 is too small to adjust with movement in pixels
		step = 1,
		// if eg KnobTime wants to input "1:04" -> 64
		interpret_type,
		axis = "Y",


		// < scale everything up?
		size = "3.4rem",
		label,

		// value via callback
		//  after release indicates greater commitment to value
		commit,
		// or a similar scheme (grab before move)
		ongrab,
		onrelease,
        // or just the bool for being in that state:
        grabbed=$bindable(),


	} = $props()



	// < if above we say: grabbed=$bindable(false),
	//    Svelte complains:
	// 	   Cannot do `bind:grabbed={undefined}` when 
	//		`grabbed` has a fallback value
	//   because of the imposition of the undefined fed in
	//	  by eg KnobTime: let grabbed = $state()
	//	  ie they "give" grabbed to, though it is just for receiving from, Knob
	grabbed = false
	// < include 
	function be_grabbed() {
		ongrab && ongrab(value)
		grabbed = true
	}
	function be_released() {
		onrelease && onrelease(value)
		commit && commit(value)
		grabbed = false
	}



	let elem: Element;
	let elemVal: Element;
	let unlock: Function = () => 1;
	// a lock becomes a selection when not moved
	let moved = false;
	// remember where we started each time
	let started = null
	// once a new value has been output, each time
	let outpute = false
	// buffer value until it has changed a whole step
	let rawValue = null;
	// usually there's a pointerup event to release the lock
	let release = () => {
		// console.log("On release")
		// knob settles into where it may be rounded to
		rawValue = value
		// workaround a kwin-wayland bug?
		move_pointer_to_where_it_started()
		// the essential unlock()
		//  can also be called ad hoc when our claim to the interaction seems to be falling apart
		unlock()
		// just clicking on the value takes you to typing in a new one
		if (!moved) elemVal.select()
		// release indicates greater commitment to value
		be_released()
	}
	let locksanity = () => document.pointerLockElement != elem && unlock()
	let lock = (ev) => {
		ev.stopPropagation()
		elem.requestPointerLock();
		// to not stick around after alt-tab (or other unknown interference)
		let lockchange = () => locksanity()
		document.addEventListener("pointerlockchange", lockchange)
		document.addEventListener("pointermove", knobMove)

		moved = false
		started = {clientX:ev.clientX,clientY:ev.clientY}
		be_grabbed()
		outpute = false

		// console.log("Start pointer at ",started)
		unlock = () => {
			// console.log("unlock")
			document.removeEventListener("pointermove", knobMove)
			document.removeEventListener("pointerlockchange", lockchange)
			document.pointerLockElement == elem
				&& document.exitPointerLock()
			unlock = () => {}
		};
	};
	onDestroy(unlock);

	let scaleFactor = space / range;
	function scaleMovement(distance: number) {
		return (distance /= scaleFactor);
	}

	// make v multiple of step
	function roundToStep(v: number) {
		let surplus = v % step;
		v -= surplus
		if (surplus*2 >= step) {
			v -= -step
		}
		return dec(v,8);
	}
	function knobMove(event: PointerEvent): void {
		let movement = get_movement(event)
		if (movement) {
			moved = true;
			if (rawValue == null) rawValue = value;
			if (outpute == false && scaleFactor >= 42) {
				// if big steps, to the first step (either way) a bit easier
				movement *= 1.618
			}
			// accumulate this change
			rawValue = rawValue + scaleMovement(movement);
			if (min != null) rawValue = Math.max(min,rawValue)
			if (max != null) rawValue = Math.min(max,rawValue)
			// output a multiple of step near that
			let newValue = roundToStep(rawValue)
			if (newValue != value) {
				outpute = true
				value = newValue
			}
		}
		locksanity()
	}

	function get_movement(event:PointerEvent) {
		let key = "movement"+axis
		if (event[key] == null) throw "no such axis: "+axis
		let movement = event[key]
		// towards the top of the screen decreases Y
		if (axis == "Y") movement *= -1
		return movement
	}
	// < this doesn't seem to work around this bug: https://bugs.kde.org/show_bug.cgi?id=478462
	let move_pointer_to_where_it_started = async () => {
		if (!started) return
    	await new Promise(resolve => setTimeout(resolve, 150));
		// await tick()
		var event = new MouseEvent('mousemove', {
			bubbles: true,
			cancelable: true,
			view: window,
			clientX: started.clientX,
			clientY: started.clientY
		});
		document.dispatchEvent(event)
	}
	function dec(s,precision) {
        if (null == precision) precision = 4
        let mul = '1e'+precision
        return (s * mul).toFixed() / mul
    }
	// also, we can type stuff in
	let onInputChange = (ev) => {
		let v = ev.currentTarget.value
		if (interpret_type) {
			v = interpret_type(v)
			if (isNaN(v)) throw "NaN"
		}
		if (v*1 != v) return console.error("Ungood knob input", v)
		value = dec(v)
	}

	// outputs
	// fast callback
	let feed_value = value
	$effect(() => {
		if (feed && value != null && value != feed_value) {
			feed(value)
			feed_value = value
		}
	})
	// the min and max values cause the knob to lean either way
	let lean = $state()
	$effect(() => {
		lean = value == min ? +5 : value == max ? -5 : 0
	})
	
	let width = "1.2em"
	let height = "1.2em"
</script>

<zf bind:this={elem} onpointerdown={lock} onpointerup={release}>
	{@render label?.()}
	<span id="knobaura">
		<span id="knobblob">
			<svg {width} {height}>
				<circle class="knobBg" cx="5" cy="{10 + lean}" r="10"/>
			</svg>
		</span>
		<input
			type="text"
			bind:this={elemVal}
			onchange={onInputChange}
			value={value}
			/>
	</span>
	<!-- <span bind:this={elemVal} contenteditable="true">{value}</span> -->
</zf>

<style>
	#knobaura {
    	position: relative;
		display: inline-block;
	}
	#knobblob {
		position: absolute;
		z-index: -1;
		pointer-events: none;
		color: #394a;
	}
	.knobBg {
		fill:rgb(75, 75, 55);
	}
	svg {
		overflow: hidden;
	}
	input {
		width: 1.8em;
		text-align: center;
		background: none;
		border: none;
		outline: none;
		pointer-events: none;
	}
	input:focus {
		pointer-events: auto;
	}
	zf {
		display: inline-block;
		min-width: 1.2em;
		min-height: 1.2em;
		overflow: hidden;
        border-radius: 0.5em;
		vertical-align: middle;
	}
	zf span {
		pointer-events:none;
	}
</style>
