<script>
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { sig } from "$lib/signaling.svelte";

    let localConnection;
    let remoteConnection;
    let sendChannel;
    let receiveChannel;
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
        let channel = par.pc.createDataChannel(label);
        channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "participant") {
                addParticipant(data.name);
            }
        };
                    sendChannel = 

                    // Announce ourselves
                    let announ = () => {
                        console.log("Sending participant");
                        sendChannel.send(
                            JSON.stringify({
                                type: "participant",
                                name: userName,
                            }),
                        );
                    };
                    if (sendChannel.readyState === "open") {
                        announ();
                    } else {
                        sendChannel.onopen = () => {
                            announ();
                        };
                    }
        return channel;
    }
    // read or add new participant
    function i_participant({ peerId, pc }) {
        let par = participants.filter((par) => par.peerId == peerId)[0];
        if (!par && pc) {
            // new par
            par = {
                peerId,
                pc,
                audio: new Audio(),
                volume: localVolume,
            };
            participants.push(par);
        }
        return par;
    }

    function updateVolume(name, volume) {
        const par = participants.filter((par) => par.name == name)[0];
        if (par) {
            par.volume = volume;
            par.audio.volume = volume;
        }
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
            localStream =
                await navigator.mediaDevices.getUserMedia(constraints);
            status = "Got microphone access";

            // this becomes our monitor maybe?
            let par = i_participant({peerId:null,pc:{},name:userName,type:"monitor"})
            localStream.getTracks().forEach((track) => {
                par.audio.srcObject = new MediaStream([track]);
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
                        console.log("Sending participant",[par,par.audio.srcObject,localStream]);
                        par.audio.play().catch(console.error);
                        status = "Audio track started from "+(par.name||"??");
                    };

                    // Set up data channel to send names
                    createDataChannel(par);
                },
            });


            addParticipant(userName);
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

        if (localConnection) {
            localConnection.close();
        }

        if (remoteConnection) {
            remoteConnection.close();
        }

        participants.forEach((participant) => {
            participant.audio.pause();
            participant.audio.srcObject = null;
        });

        participants.clear();
        participants = participants;

        localConnection = null;
        remoteConnection = null;
        localStream = null;
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
        {#each [...participants] as [name, participant]}
            <div class="participant">
                <span>{name}</span>
                <label>
                    Volume:
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        bind:value={participant.volume}
                        oninput={() => updateVolume(name, participant.volume)}
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
