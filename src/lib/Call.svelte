<script lang="ts">
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { SignalingClient } from "$lib/rtcsignaling-client.svelte";
    import { BitrateStats } from "$lib/bitratestats.svelte";

    let Signaling: SignalingClient;
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");
    let userName = $state("you");
    let participants = $state([]);
    let bitrates = new BitrateStats()
    let localVolume = 0.7;

    // participants exchange names in a webrtc datachannel
    $effect(() => {
        if (userName == "you") {
            // init
            if (localStorage.userName) {
                userName = localStorage.userName;
            }
        } else {
            localStorage.userName = userName;
        }
    });
    function createDataChannel(par) {
        par.channel = par.pc.createDataChannel("participants");
        // the receiver is this other channel they sent us
        //  I don't know why we have to call it "participants" then
        par.pc.ondatachannel = (event) => {
            event.channel.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "participant") {
                    par = i_participant({ peerId: par.peerId });
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
            if (par.channel.readyState != "open") debugger
            announce_self();
            // console.log(`Data open: ${par.peerId}`);
        };
        par.channel.onclose = () => {
            par.offline = 1;
            delete par.bitrate;
            console.log(`Leaves: ${par.name}`);
        };
    }
    // read or add new participant
    function i_participant({ peerId, pc }, etc?) {
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
        etc && Object.assign(par, etc)
        if (!par.type) {
            // subscribe this connection to bitrate monitoring
            bitrates.add_par(par)
        }

        let names = participants.map((par) => par.peerId + ": " + par.name);
        console.log("i_participant: " + peerId, names);

        return par;
    }
    function i_self_par(localStream) {
        // this becomes our monitor maybe?
        let par = i_participant({ peerId: "", pc: {} });
        delete par.pc;
        par.name = userName;
        par.type = "monitor";
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

            let par = i_self_par(localStream)

            // start signaling via websocket to get to webrtc...
            if (Signaling) {
                // should have been packed up
                debugger;
                Signaling.close();
            }
            Signaling = new SignalingClient({
                on_peer: ({ peerId, pc }) => {
                    // a peer connection, soon to receive tracks, name etc
                    let par = i_participant({ peerId, pc });

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
            status = "Audio track started";
        };
    }

    // connect our stream to a peer, complicatedly
    function give_localStream(par) {
        // Remove existing senders before adding new tracks
        // par.pc.getSenders().forEach((sender) => {
        //     if (sender.track) {
        //         par.pc.removeTrack(sender);
        //     }
        // });

        // Add tracks safely
        localStream.getTracks().forEach((track) => {
            try {
                par.pc.addTrack(track, localStream);
            } catch (error) {
                console.error("Failed to add track:", error);
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
    let themain = $state();
    $effect(() => {
        if (themain) {
            themain.style.display = "initial";
        }
    });

    onDestroy(() => {
        stopConnection();
    });
</script>

<main class="container" style="display:none;" bind:this={themain}>
    <div class="setup">
        <input
            type="text"
            bind:value={userName}
            placeholder="Enter your name"
            disabled={status !== "Disconnected"}
        />
    </div>

    <div class="controls">
        <button onclick={startConnection} disabled={status !== "Disconnected"}>
            Ring
        </button>

        <button onclick={stopConnection} disabled={status === "Disconnected"}>
            Not
        </button>
    </div>

    <div class="status">
        <p>Status: {status}</p>
        {#if errorMessage}
            <p class="error">{errorMessage}</p>
        {/if}
    </div>

    <div class="participants">
        <h2>Participants</h2>
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
        font: monospace;
        transform: scaleY(0.7);
        filter: blur(1px);
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
    }

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .status {
        margin-top: 2rem;
    }

    .error {
        color: red;
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
