<script lang="ts">
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { SignalingClient } from "$lib/rtcsignaling-client.svelte";
    import { BitrateStats } from "$lib/bitratestats.svelte";
    import { parRecorder,retryRecordingUploads } from "$lib/recording";
    
    let Signaling: SignalingClient;
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");
    let userName = $state("you");
    let participants = $state([]);
    let bitrates = new BitrateStats();
    // it never seems to use more than 266 if given more
    let target_bitrate = 270;
    let localVolume = 0.7;

    // participants exchange names in a webrtc datachannel
    function createDataChannel(par) {
        par.channel = par.pc.createDataChannel("participants");
        // the receiver is this other channel they sent us
        //  I don't know why we have to call it "participants" then
        par.pc.ondatachannel = (event) => {
            event.channel.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "participant") {
                    // < for some reason we have to seek out the par again at this point
                    //   not doing this leads to this.par.name being undefined
                    //    much later in parRecorder.uploadCurrentSegment
                    //    see "it seems like a svelte5 object proxy problem"
                    par = i_par({ peerId: par.peerId });
                    par.name = data.name;
                    console.log(`Received name of ${par.peerId}: ${par.name}`)
                }
            };
        };

        // Announce ourselves
        let announce_self = () => {
            // console.log("Sending participant");
            par.channel.send(
                JSON.stringify({
                    type: "participant",
                    name: userName,
                }),
            );
            // once
            announce_self = () => {};
        };
        // when ready
        if (par.channel.readyState === "open") {
            debugger;
            announce_self();
        }

        par.channel.onopen = () => {
            delete par.offline;
            // check again it's totally ready..?
            if (par.channel.readyState != "open") debugger;
            announce_self();
            // console.log(`Data open: ${par.peerId}`);
        };
        par.channel.onclose = () => {
            par.offline = 1;
            delete par.bitrate;
            console.log(`Leaves: ${par.name}`);
        };
    }

    type Participant = {peerId:string,pc?:RTCPeerConnection,name?}
    // read or add new participant (par)
    function i_par({ peerId, pc, ...etc }):Participant {
        let par = participants.filter((par) => par.peerId == peerId)[0];
        let was_new = 0;
        if (pc) {
            if (!par) {
                was_new = 2;
                // new par
                par = { peerId, pc };
                par.audio = new Audio();
                par.audio.volume = localVolume;
                participants.push(par);
                par.pc && bitrates.add_par(par);
                // they record
                // par.recorder = new parRecorder({par:par,...stuff_we_tell_parRecorder()})
            } else {
                was_new = 1;
                // stream|par.pc changes, same par|peerId
                //  peerId comes from socket.io, is per their websocket
                console.log(`i_par: stream changes, same peer: ${par.name}`)
                // I haven't found a way to trigger this branch...
                debugger
                // bitratestats will notice this change itself
                if (par.pc == pc) debugger;
                // Stop existing recording if we're replacing the connection
                //  it needs to be started again on a new MediaStream
                if (par.recorder) {
                    par.recorder.stop();
                }
                par.pc && par.pc?.close();
                par.pc = pc;
            }
        }

        // you give them properties
        Object.assign(par, etc);
        
        return par;
    }
    // this becomes our monitor
    function i_myself_par(localStream) {
        let par = i_par({
            peerId: "",
            pc: {},
            name: userName,
            type: "monitor",
        });
        delete par.pc;
        localStream.getTracks().forEach((track) => {
            // Create a new MediaStream for monitoring
            const monitorStream = new MediaStream([track]);
            
            par.audio.srcObject = monitorStream
            par.audio.volume = 0;
            par.audio.play().catch(console.error);

            // Start recording this same stream
            try {
                if (par.recorder) {
                    par.recorder.start(monitorStream);
                    console.log("Started recording self stream");
                }
            } catch (error) {
                console.error("Failed to start self recording:", error);
            }
        });
    }
    function volumeChange(par) {
        console.log("Volume is " + par.audio.volume);
    }
    // mainly
    // having no voice-only audio processing is essential for hifi
    // < high bitrate
    // < flip on|off video
    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    };
    async function startStreaming() {
        // Get microphone stream
        localStream ||=
            await navigator.mediaDevices.getUserMedia(constraints);
        status = "Got microphone access";

        i_myself_par(localStream);
    }
    async function startConnection() {
        if (!userName.trim()) {
            errorMessage = "Please enter your name first";
            return;
        }
        // this will be, sync, after negate()
        status = "Plugging out";
        errorMessage = "";
        try {
            if (!localStream) {
                // once, before Signaling and peers arrive
                await startStreaming()
            }
            // start signaling via websocket to get to webrtc...
            if (Signaling) {
                // should have been packed up
                debugger;
                Signaling.close();
            }
            Signaling = new SignalingClient({
                on_peer: ({ peerId, pc }) => {
                    // a peer connection, soon to receive tracks, name etc
                    let par = i_par({ peerId, pc });

                    // watch it become 'connected' (or so)
                    wait_for_par_ready(par, () => {
                        console.log("Par ready! " + par.peerId);

                        // input our stream to it
                        give_localStream(par);

                        // take audio from it
                        take_remoteStream(par);

                        // Set up data channel to send names
                        createDataChannel(par);
                    });
                },
            });
        } catch (error) {
            errorMessage = `Error: ${error.message}`;
            status = "Error occurred";
            console.error("Error:", error);
        }
    }

    // wait for par.pc to get in a good state
    //  and forever copy whatever it changes to to par.constate
    function wait_for_par_ready(par, resolve) {
        let done = 0;
        let ready = 0;
        let observe = () => {
            let says = par.pc.connectionState + "/" + par.pc.signalingState;
            par.constate = says;

            // https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState
            if (
                [
                    // if we don't accept 'new' initially they never get there...
                    "new",
                    "connected",
                    // ,'connecting'
                ].includes(par.pc.connectionState) &&
                [
                    "stable",
                    // 'have-local-offer'
                ].includes(par.pc.signalingState)
            ) {
                ready = 1;
            } else {
                ready = 0;
            }
            0 &&
                console.log(
                    "Waiting " +
                        ((ready && "ready") || "") +
                        "for par" +
                        ((done && "done") || "") +
                        ": " +
                        says,
                    par,
                );
            if (ready && !done) {
                done = 1;
                resolve();
            }
        };
        observe();
        par.pc.onconnectionstatechange = observe;
        par.pc.onsignalingstatechange = observe;
    }

    // take audio from a peer
    function take_remoteStream(par) {
        par.pc.ontrack = (e) => {
            par.audio.srcObject = new MediaStream([e.track]);

            // Start recording the received stream
            if (par.recorder) {
                par.recorder.start(par.audio.srcObject);
            }

            // console.log("Got track", [par, par.audio.srcObject, localStream]);
            par.audio.play().catch(console.error);
            status = "Got things";
        };
    }
    function setAudioBitrate(sender, bitrate) {
        const params = sender.getParameters();
        // Check if we have encoding parameters
        if (!params.encodings) {
            params.encodings = [{}];
        }

        // Set the maximum bitrate (in bps)
        params.encodings[0].maxBitrate = bitrate * 1000; // Convert kbps to bps

        // Apply the parameters
        return sender.setParameters(params);
    }

    // Modify your give_localStream function to include bitrate control
    function give_localStream(par) {
        localStream.getTracks().forEach((track) => {
            try {
                const sender = par.pc.addTrack(track, localStream);

                // For audio tracks, set the desired bitrate
                if (track.kind === "audio") {
                    // Wait for the connection to be established
                    par.pc.addEventListener("connectionstatechange", () => {
                        if (par.pc.connectionState === "connected") {
                            setAudioBitrate(sender, target_bitrate).catch(
                                (error) =>
                                    console.error(
                                        "Failed to set bitrate:",
                                        error,
                                    ),
                            );
                        }
                    });
                }
            } catch (error) {
                console.error("Failed to add track:", error);
            }
        });
    }
    // Optional: Add a function to dynamically adjust bitrate
    function stuff_we_tell_parRecorder() {
        return {
            title:goable_title,
            bitrate:target_bitrate,
            i_par,
        }
    }

    function updateAudioBitrate(newBitrate) {
        target_bitrate = newBitrate;
        participants.map((par) => {
            if (par.pc && par.pc.getSenders) {
                const audioSender = par.pc
                    .getSenders()
                    .find((sender) => sender.track?.kind === "audio");

                if (audioSender) {
                    setAudioBitrate(audioSender, newBitrate).catch((error) =>
                        console.error("Failed to update bitrate:", error),
                    );
                }

                // we record like that too?
                if (par.recorder) {
                    par.recorder.bitrate_changed(target_bitrate)
                }
            }
        });
    }

    // switch everything off
    function stopConnection() {
        bitrates.close();
        participants.map(par => {
            par.pc?.close();
            if (par.recorder) {
                par.recorder.stop()
            }
            par.audio.pause();
            par.audio.srcObject = null;
        });
        Signaling && Signaling.close();
        Signaling = null;

        status = "Disconnected";
        errorMessage = "";
    }

    //
    // username related
    //
    function changeyourname(event) {
        userName = event.target.textContent;
    }
    let first_writingyourname = true;
    function writingyourname(event) {
        // a noise filter
        console.log("writingyourname", event);
        if (event.key == "Enter") {
            console.log("Caught Enter, assume you want to Ring now");
            negate();
            // unfocus - so the android keyboard should retract?
            yourname.blur();
            event.preventDefault();
        } else {
            if (first_writingyourname) {
                first_writingyourname = false;
                if (userName == "you") {
                    userName_printable = "";
                }
            }
        }
    }
    // make a printable version that we will update less
    // svelte-ignore state_referenced_locally
    let userName_printable = $state(userName);
    let loaded_username = false;
    // resume the last username
    // and copy to printable if a change
    $effect(() => {
        if (userName == "you" && !loaded_username) {
            // init
            loaded_username = true;
            if (localStorage.userName) {
                userName = localStorage.userName;
            }
        } else {
            localStorage.userName = userName;
        }
        // check we aren't overwriting the source of this data
        if (yourname && yourname.textContent != userName) {
            userName_printable = userName;
        }
    });
    let yourname;
    // ensnare the user in paperwork on their first visit
    let focus_yourname_once = true;
    let focus_yourname_after_ms = 720
    $effect(() => {
        // have to put this after we may have loaded_username
        if (yourname && focus_yourname_once && userName == "you") {
            focus_yourname_once = false;
            setTimeout(() => {
                yourname.textContent = ""
                yourname.focus();
            }, focus_yourname_after_ms);
            console.log("focus yourname");
        }
    });

    //
    // misc
    //
    // the interface reveals on first $effect()
    // < blur?
    let themain = $state();
    $effect(() => {
        if (themain) {
            // < fade in. this is for the awkward slow loads.
            themain.style.display = "initial";
        }
    });
    // buttons word changes
    let say_negate = $state("Ring");
    let negating = $state(false);
    function negate() {
        if (status === "Disconnected") {
            startConnection();
            if (status === "Disconnected") {
                // we rely on this instantly changing
                debugger;
            }
            say_negate = "leave";
        } else {
            stopConnection();
            say_negate = "Ring";
        }
    }
    // auto-resume - good for debugging when all clients refresh all the time
    let resumable_once = true;
    $effect(() => {
        if (resumable_once) {
            // init
            resumable_once = false;
            if (localStorage.was_on && userName != "you") {
                console.log("Resuming...");
                setTimeout(() => negate(), 91);
            }
        }
    });
    // after the above, or it will store the default was_on=false
    $effect(() => {
        if (status === "Disconnected") {
            delete localStorage.was_on;
        } else {
            localStorage.was_on = "call";
        }
    });

    //
    // have a title
    //
    let title = $state('untitled')
    let yourtitle:Element
    let loaded_title = false;
    let first_writingyourtitle = true
    // resume the last title
    // and copy to printable if a change
    $effect(() => {
        if (title == "untitled" && !loaded_title) {
            // init
            loaded_title = true;
            if (localStorage.title) {
                title = localStorage.title;
            }
        } else {
            localStorage.title = title;
        }
        // check we aren't overwriting the source of this data
        if (yourtitle && yourtitle.textContent != title) {
            title_printable = title;
        }
    });
    let title_printable = $state(title)
    function changeyourtitle(event) {
        title = event.target.textContent;
    }
    function writingyourtitle(event) {
        // a noise filter
        console.log("writingyourtitle", event);
        if (event.key == "Enter") {
            console.log("Caught Enter, assume you wrote a title");
            // unfocus - so the android keyboard should retract?
            yourtitle.blur();
            commit_titlechange();
            event.preventDefault();
        }
    }

    // the title button|label blanks the title
    function letswriteatitle(event) {
        if (yourtitle) {
            yourtitle.textContent = ""
            yourtitle.focus()
        }
    }
    // as will it being the default, once
    function yourtitle_onfocus(event) {
        if (first_writingyourtitle) {
            first_writingyourtitle = false;
            // clear the default value
            if (title == "untitled") {
                yourtitle.textContent = ""
            }
        }
    }

    // prevents the record changing title too quickly while typing
    //  while not requiring a onblur() event to set it
    let goable_title = $state(title)
    $effect(() => {
        if (title != goable_title) {
            pend_titlechange()
        }
    })
    // a unique object
    let pending_titlechange = {}
    function pend_titlechange() {
        console.log("Pending began for "+title)
        let thischange = pending_titlechange = {}
        setTimeout(() => {
            if (thischange == pending_titlechange) {
                commit_titlechange()
            }
        },2200)
    }
    function commit_titlechange() {
        pending_titlechange = {}
        if (title != goable_title) {
            goable_title = title
        }
    }
    // the recordings get the title, will segment on change
    $effect(() => {
        if (goable_title) {
            participants.map((par) => {
                par.recorder.title_changed(goable_title)
            });
        }
    })
    
    let quitervals = []
    $effect(() => {
        // Periodically retry failed uploads, eg now
        // retryRecordingUploads()
        // And every 5 minutes
        // quitervals.push(setInterval(retryRecordingUploads, 5 * 60 * 1000));
    })
    function lets_upload() {
        // retryRecordingUploads()
        
        console.log("Ya"+2 )
    }
    $inspect(participants)
    onDestroy(() => {
        quitervals.map(clearInterval)
        stopConnection();
    })

    // < is it possible to reuse the encoded opus that was transmit to us as the recorded copy?
</script>

<main class="container" style="display:none;" bind:this={themain}>
    <h1>
        <span class="welcometo overhang">Welcome to</span>
        <span class="jamola"><a href="https://github.com/stylehouse/jamola">jamola</a></span>,
        <span
            contenteditable={status == "Disconnected"}
            bind:this={yourname}
            oninput={changeyourname}
            onkeypress={writingyourname}
            class="yourname">{userName_printable}</span
        >
        !
    </h1>

    <div class="controls">
        <button onclick={negate} disabled={negating}>
            {say_negate}
        </button>
        <button onclick={lets_upload} disabled={negating}>
            upload
        </button>

        <label>
            <span class="overhang">bitrate</span>
            <select
                onchange={(e) => updateAudioBitrate(parseInt(e.target.value))}
            >
                <option value="50">50</option>
                <option value="80">80</option>
                <option value="130">130</option>
                <option value="270" selected>270</option>
                <option value="320">320</option>
            </select>
        </label>

        <p class="status">{status}</p>
        {#if errorMessage}
            <p class="error">{errorMessage}</p>
        {/if}
    </div>
    <div class="participants">
        <h1 class="casual" >


            <button class="casual"
                    onclick={letswriteatitle}
                >Title</button>


                <span
                    contenteditable={status != "Disconnected"}
                    bind:this={yourtitle}
                    onfocus={yourtitle_onfocus}
                    oninput={changeyourtitle}
                    onkeypress={writingyourtitle}
                    onblur={commit_titlechange}
                    class="yourtitle"
                    spellcheck="false"

                    >{title_printable}</span>

        </h1>
        {#each participants as par (par.peerId)}
            <div class="participant {par.type == 'monitor' && 'monitor'}">
                <span class="theyname">{par.name || par.peerId}</span>
                {#if par.type}<span class="streamtype">{par.type}</span>{/if}
                {#if par.offline}<span class="ohno">offline</span>{/if}
                {#if par.constate}<span class="techwhat">{par.constate}</span
                    >{/if}

                <label>
                    <span class="overhang">volume</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        bind:value={par.audio.volume}
                        onchange={() => volumeChange(par)}
                    />
                </label>

                {#if par.bitrate}<span class="bitrate">{par.bitrate} kbps</span
                    >{/if}
            </div>
        {/each}
    </div>
</main>

<style>
    @font-face {
        font-family: "RipeApricots";
        src: url("/RipeApricots.ttf") format("truetype");
        font-weight: normal;
        font-style: normal;
    }
    :global(h1),
    :global(button, select) {
        font-family: "RipeApricots", sans-serif;
        background: #4024;
        font-size: 2em;
        padding: 9px;
        vertical-align: middle;
    }
    div,
    h1,
    button,
    select,
    yourname {
        border-radius: 1em;
    }
    :global(h1) {
        font-size: 330%;
    }
    .welcometo {
        color: #11271e;
    }
    .jamola {
        font-size: 220%;
        color: #2d0769;
    }
    .jamola a {
        color:inherit;
        /* text-decoration:inherit; */
    }
    .yourname {
        font-size: 170%;
        color: rgb(54, 19, 19);
        text-shadow: 5px 3px 9px #aca;
    }
    .yourtitle {
        font-size: 170%;
        color: rgb(54, 19, 19);
        text-shadow: 5px 3px 9px #aca;
    }
    span[contenteditable=true] {
        border-bottom: 7px dashed #84d;
    }
    .overhang {
        position: absolute;
        pointer-events: none;
    }

    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem;
    }

    .setup {
        margin: 1rem 0;
    }

    .controls {
        display: flex;
        gap: 1rem;
        margin: 2rem 0;
    }
    button {
        padding: 0.3rem 1rem;
        cursor: pointer;
        font-size: 8em;
        line-height: 0.3em;
    }
    .casual {
        line-height: 0.3em;
        margin: 0em;
    }
    .casual button {
        background-color: rgba(97, 88, 60, 0.322);
        font-size:1.2em;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .status {
        color: rgb(17, 11, 75);
        font-family: monospace;
    }
    .error {
        color: red;
        font-family: monospace;
    }

    /* par bits */

    .ohno {
        color: red;
        font: monospace;
    }
    .techwhat {
        color: cyan;
        font: monospace;
    }
    .bitrate {
        color: cyan;
        font-family: monospace;
        transform: scaleY(0.7);
        filter: blur(1px);
    }

    input[type="range"]::-webkit-slider-runnable-track {
        width: 100%;
        height: 18px;
        background: #ddd;
        border-radius: 4px;
    }

    input[type="range"]::-moz-range-track {
        width: 100%;
        height: 8px;
        background: #ddd;
        border-radius: 4px;
    }

    input[type="range"]::-ms-track {
        width: 100%;
        height: 18px;
        background: transparent;
        border-color: transparent;
        color: transparent;
    }

    .participant {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: 0.5rem 0;
        padding: 0.5rem;
        background: #2b463b;
        border-radius: 4px;
    }
    .monitor {
        background-color: #25855d;
    }

    input[type="range"] {
        width: 150px;
    }

    input[type="text"] {
        padding: 0.5rem;
        width: 200px;
    }
</style>
