<script>
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { sig } from "$lib/rtcsignaling-client.svelte";

    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");
    let userName = $state("you");
    let participants = $state([]); // Map of participant name to {audio: HTMLAudioElement, volume: number}
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
                console.log("Got participant: "+data.name);
                if (data.type === "participant") {
                    par = i_participant({peerId:par.peerId})
                    par.name = data.name
                }
            };
        }

        // Announce ourselves
        let announce_self = () => {
            console.log("Sending participant");
            par.channel.send(
                JSON.stringify({
                    type: "participant",
                    name: userName,
                }),
            );
        };

         
        if (par.channel.readyState === "open") {
            announce_self()
        }
        else {
            par.channel.onopen = announce_self
        }
    }
    // read or add new participant
    function i_participant({ peerId, pc }) {
        let par = participants.filter((par) => par.peerId == peerId)[0];
        if (!par && pc) {
            // new par
            par = {peerId,pc};
            par.audio = new Audio();
            par.audio.volume = localVolume;
            participants.push(par);
        }
        return par;
    }
    function volumeChange(par) {
        console.log("Volume is "+ par.audio.volume)
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

            // this becomes our monitor maybe?
            let par = i_participant({peerId:null,pc:{}})
            delete par.pc
            par.name = userName
            par.type = "monitor"
            
            localStream.getTracks().forEach((track) => {
                par.audio.srcObject = new MediaStream([track]);
                par.audio.play().catch(console.error);
            });

            // start signaling via websocket to get to webrtc...
            sig({
                on_pc: ({ peerId, pc }) => {
                    // a peer connection, soon to receive tracks, name etc
                    let par = i_participant({ peerId, pc });


                    // input our stream to it
                    localStream.getTracks().forEach((track) => {
                        par.pc.addTrack(track, localStream);
                    });

                    // take audio from it
                    par.pc.ontrack = (e) => {
                        par.audio.srcObject = new MediaStream([e.track]);
                        console.log("Got track",[par,par.audio.srcObject,localStream]);
                        par.audio.play().catch(console.error);
                        status = "Audio track started from "+(par.name||"??");
                    };

                    // Set up data channel to send names
                    createDataChannel(par);
                },
            });
        } catch (error) {
            errorMessage = `Error: ${error.message}`;
            status = "Error occurred";
            console.error("Error:", error);
        }
    }

    // switch everything off
    function stopConnection() {
        if (localStream) {
            localStream.getTracks().forEach((track) => track.stop());
        }
        participants.forEach((par) => {
            par.pc?.close();
            par.audio.pause();
            par.audio.srcObject = null;
        });

        participants = []
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
                <span>{par.name || "???"}</span>
                {#if par.type}<span class="streamtype">{par.type}</span>{/if}
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
