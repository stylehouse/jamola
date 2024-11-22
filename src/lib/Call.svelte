<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { SignalingClient } from "$lib/rtcsignaling-client.svelte";
    import { BitrateStats } from "$lib/bitratestats.svelte";

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
                    par = i_par({ peerId: par.peerId });
                    par.name = data.name;
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

    // read or add new participant (par)
    function i_par({ peerId, pc, ...etc }) {
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
            } else {
                was_new = 1;
                // allow that same object to take over..?
                //  peerId comes from socket.io, is per their websocket
                if (par.pc == pc) debugger;
                par.pc && par.pc?.close();
                par.pc = pc;
            }
        }

        // you give them properties
        Object.assign(par, etc);
        if (!par.type) {
            // subscribe this connection to bitrate monitoring
            bitrates.add_par(par);
        }

        let names = participants.map((par) => par.peerId + ": " + par.name);
        console.log("i_participant: " + peerId, names);

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
            par.audio.srcObject = new MediaStream([track]);
            par.audio.volume = 0;
            par.audio.play().catch(console.error);
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
    async function startConnection() {
        if (!userName.trim()) {
            errorMessage = "Please enter your name first";
            return;
        }
        errorMessage = "";
        try {
            // Get microphone stream
            localStream ||=
                await navigator.mediaDevices.getUserMedia(constraints);
            status = "Got microphone access";

            let par = i_myself_par(localStream);

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
            console.log("Got track", [par, par.audio.srcObject, localStream]);
            par.audio.play().catch(console.error);
            status = "Got track";
        };
    }
    // Add this function to control bitrate parameters
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
                            // Set initial bitrate (e.g., 128 kbps for high quality Opus)
                            setAudioBitrate(sender, target_bitrate).catch((error) =>
                                console.error("Failed to set bitrate:", error),
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
    function updateAudioBitrate(newBitrate) {
        target_bitrate = newBitrate
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
            }
        });
    }

    // switch everything off
    function stopConnection() {
        bitrates.close();
        participants.forEach((par) => {
            par.pc?.close();
            par.audio.pause();
            par.audio.srcObject = null;
        });
        Signaling && Signaling.close();
        Signaling = null;

        // Remove all others? Or let them become disconnected, keeping their recordings?
        // participants = participants.filter(par => par.type != 'monitor')
        // < merge same usernames after a while?

        // localStream = null;
        status = "Disconnected";
        errorMessage = "";
    }
    onDestroy(() => {
        stopConnection();
    });

    // username related
    function changeyourname(event) {
        userName = event.target.textContent;
    }
    let first_writingyourname = true;
    function writingyourname(event) {
        // a noise filter
        console.log("writingyourname", event);
        if (event.key == "Enter") {
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
    let userName_printable = $state(userName);
    let loaded_username = false;
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
    let focus_yourname_once = true;
    $effect(() => {
        // have to put this after we may have loaded_username
        if (yourname && focus_yourname_once && userName == "you") {
            focus_yourname_once = false;
            setTimeout(() => {
                yourname.focus();
            }, 130);
            console.log("focus yourname");
        }
    });

    // misc
    // the interface reveals on first $effect()
    // < blur?
    let themain = $state();
    $effect(() => {
        if (themain) {
            // < fade in. this is for the awkward slow loads.
            themain.style.display = "initial";
        }
    })
    // buttons word changes
    let say_negate = $state("Ring")
    let negating = $state(false)
    function negate() {
        if (status === "Disconnected") {
            startConnection()
            say_negate = "leave"
        }
        else {
            stopConnection()
            say_negate = "Ring"
        }
    }
</script>

<main class="container" style="display:none;" bind:this={themain}>
    <h1>
        <span class="welcometo">Welcome to</span>
        <span class="jamola">jamola</span>,
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

        <label>
            <overhang>bitrate</overhang>
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
        <h1>Participants</h1>
        {#each participants as par (par.peerId)}
            <div class="participant">
                <span>{par.name || par.peerId}</span>
                {#if par.type}<span class="streamtype">{par.type}</span>{/if}
                {#if par.offline}<span class="ohno">offline</span>{/if}
                {#if par.constate}<span class="techwhat">{par.constate}</span
                    >{/if}
                {#if par.bitrate}<span class="bitrate">{par.bitrate} kbps</span
                    >{/if}

                <label>
                    Volume:
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        bind:value={par.audio.volume}
                        onchange={() => volumeChange(par)}
                    />
                </label>
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
    div,h1,button,select,yourname {
        border-radius:1em;
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
    .yourname {
        font-size: 170%;
        color: rgb(54, 19, 19);
        text-shadow: 5px 3px 9px #aca;
    }
    span[contenteditable] {
        border-bottom: 7px dashed #84d;
    }
    overhang {
        position: absolute;
        pointer-events: none;
    }
    button {
        padding: 0.3rem 1rem;
        cursor: pointer;
        font-size: 8em;
        line-height:0.3em;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
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
    .status {
        color: rgb(17, 11, 75);
        font-family: monospace;

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

    .error {
        color: red;
        font-family: monospace;
    }

    .participants {
        margin-top: 2rem;
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

    input[type="range"] {
        width: 150px;
    }

    input[type="text"] {
        padding: 0.5rem;
        width: 200px;
    }
</style>
