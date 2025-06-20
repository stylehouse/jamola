<script lang="ts">
    import { throttle } from "$lib/Y";
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

		// < prefer these callbacks to bindable value?
		//    we seem to be resvelting a lot of Knob while twiddling value
		//    commit to value itself on release
			feed,
			slow,
			change_hz = 16,

			// idiomatic?
			valued=$bindable(),

		// drag distance of range
		//  300px seems good, can be done in either direction by a relaxed hand
		space = 300,
		// how much value changes over the space
		range,
		// optional limits to value
		// will imply range
		//  eg, if these were 20 apart, you'd drag by space to go between
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

	// interpretation of arguments
	//  and repeatable, see RacFecCon.svelte
	//   where you might instantiate Knob with no Knob_props initially
	let scaleFactor
	$effect(() => {
		let extent = range
		extent ||= (max||0) - (min||0)
		extent ||= 20

		scaleFactor = space / extent;

		slow_throttle = throttle(
			// < change change_hz for more refined moves when pressing harder etc
			(v) => slow(v,change_hz),
			1000 / change_hz
		)
	})

	// output stage
	// fast callback: any unique value
	let feed_value = value
	let slow_value = value
	let slow_throttle
	$effect(() => {
		if (feed && value != null && value != feed_value) {
			feed(value)
			feed_value = value
		}
		if (slow && value != null && value != slow_value) {
			slow_throttle(value)
		}
	})
	// < not too fast callback


	// < if above we say: grabbed=$bindable(false),
	//    Svelte complains:
	// 	   Cannot do `bind:grabbed={undefined}` when 
	//		`grabbed` has a fallback value
	//   because of the imposition of the undefined fed in
	//	  by eg KnobTime: let grabbed = $state()
	//	  ie they "give" grabbed to, though it is just for receiving from, Knob
	grabbed = false
	function be_grabbed() {
		grabbed = true
		ongrab && ongrab(value)
	}
	function be_released() {
		grabbed = false
		onrelease && onrelease(value)
		commit && commit(value)
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
	let rawValue = $state(null);

	
    // Prevent default page scroll/drag behavior, maybe? on smartphones
	function preventDefault(event: PointerEvent) {
        event?.preventDefault();
        event?.stopPropagation();
    }
    function constrainValue(val: number): number {
        let constrainedVal = val;
        if (min !== undefined) constrainedVal = Math.max(min, constrainedVal);
        if (max !== undefined) constrainedVal = Math.min(max, constrainedVal);
        return roundToStep(constrainedVal);
    }
    function roundToStep(val: number): number {
        const multiplier = 1 / step;
        return Math.round(val * multiplier) / multiplier;
    }

	let tracking_movement = {}
	function track_aspect(ev,k) {
		let v = ev[k]
		let prev = tracking_movement[k] ?? started[k]
		let delta = v - prev
		tracking_movement[k] = v
		return delta
	}
    function calculateMovement(ev: PointerEvent): number {
		let moveX = track_aspect(ev,'clientX')
		let moveY = -track_aspect(ev,'clientY')
		// allow the user to assume either axis
		let movement = moveX + moveY
		return movement
    }


	// < test whether this ever helps. is it for alt-tab and back?
	let locksanity = () => {
		return 1
		if (document.pointerLockElement == elem) return
		console.log("locksanity unlock due to !pointerLockElement")
		unlock()
	}
    function lock(ev: PointerEvent) {
		preventDefault(ev)

		// < GOING, but still want on desktop?
		// elem.requestPointerLock();
		// GOING?
		// to not stick around after alt-tab (or other unknown interference)
		// let lockchange = () => locksanity()
		// document.addEventListener("pointerlockchange", () => {
		// 	console.log("pointerlockchange!")
		// 	lockchange()
		// })
		// // console.log("Start pointer at ",started)
		// unlock = () => {
		// 	console.log("unlock")
		// 	// document.removeEventListener("pointermove", knobMove)
		// 	document.removeEventListener("pointerlockchange", lockchange)
		// 	document.pointerLockElement == elem
		// 		&& document.exitPointerLock()
		// 	unlock = () => {}
		// };

		elem.setPointerCapture(ev.pointerId);

		moved = false
		// Relative to browser viewport  Top-left of viewport
		// < increase range at viewport's edge
		//	 or maybe scroll the knob further in from the edge of the page?
        started = { clientX: ev.clientX, clientY: ev.clientY };
        rawValue = value;
		outpute = false
		be_grabbed()


        // Add global move and up listeners
        document.addEventListener("pointermove", knobMove, { passive: false });
        document.addEventListener("pointerup", release, { passive: false });
        document.addEventListener("blur", () => {
			if (document.pointerLockElement == elem) return
			console.log("locksanity unlock due to !pointerLockElement")
			release()
		}, { passive: false });
	};
	onDestroy(unlock);

	function knobMove(event: PointerEvent): void {
		preventDefault(event)

        let movement = calculateMovement(event);
        if (!movement) return;
        moved = true;

		if (outpute == false && scaleFactor >= 42) {
			// if big steps, to the first step (either way) a bit easier
			movement *= 1.618
		}

        // < Adjust movement sensitivity for touch devices
        const sensitivityFactor = 0.8;

		// accumulate this change
        rawValue = (rawValue ?? value) + (movement / scaleFactor) * sensitivityFactor;

		// output a multiple of step near that
        const newValue = constrainValue(rawValue);
        
        if (newValue !== value) {
            value = newValue;
            outpute = true;
            // leads to feed(), see output stages
			value = newValue
        }
		locksanity()
	}


	// usually there's a pointerup event to release the lock
    function release(event?: PointerEvent) {
		preventDefault(event)
        // Release pointer capture
        elem.releasePointerCapture(event?.pointerId);
        // Remove global listeners
        document.removeEventListener("pointermove", knobMove);
        document.removeEventListener("pointerup", release);
        document.removeEventListener("blur", release);
		// just clicking on the value takes you to typing in a new one
		if (!moved) elemVal.select()


		// console.log("On release")
		// knob settles into where it may be rounded to
		rawValue = value
		// next drag starts again
		tracking_movement = {}
		// workaround a kwin-wayland bug?
		// move_pointer_to_where_it_started()
		// the essential unlock()
		//  can also be called ad hoc when our claim to the interaction seems to be falling apart
		// unlock()
		
		// release indicates greater commitment to value
		be_released()
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
    function handleInput(ev: Event) {
		let v = (ev.target as HTMLInputElement).value
		if (interpret_type) {
			v = interpret_type(v)
			if (isNaN(v)) throw "NaN"
		}
		if (v*1 != v) return console.error("Ungood knob input", v)
		value = constrainValue(v);
	}



	// the min and max values cause the knob to lean either way
	let lean = $state()
	$effect(() => {
		lean = value == min ? +5 : value == max ? -5 : 0
	})
	
	let width = "1.2em"
	let height = "1.2em"
</script>

<zf bind:this={elem} onpointerdown={lock}>
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
			onchange={handleInput}
			value={value}
			/>
	</span>
	<!-- <span bind:this={elemVal} contenteditable="true">{value}</span> -->
	 <!-- <span style="border:3px solid green"> raw:{dec(rawValue)}</span> -->
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
		font-size: 1em;
	}
	input:focus {
		pointer-events: auto;
	}
	zf {
		display: inline-block;
		min-width: 1.2em;
		min-height: 1.2em;
		/* overflow: hidden; */
        border-radius: 0.5em;
		vertical-align: middle;
        touch-action: none;  /* Prevent browser's default touch scrolling */
        user-select: none;   /* Prevent text selection during drag */
	}
	zf span {
		pointer-events:none;
	}
</style>
