<script>
    import { onDestroy } from "svelte";
    import { SvelteMap } from "svelte/reactivity";

    let localConnection;
    let remoteConnection;
    let sendChannel;
    let receiveChannel;
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");
    let userName = $state("you");
    let participants = $state(new SvelteMap()); // Map of participant name to {audio: HTMLAudioElement, volume: number}
    let localVolume = 1.0;

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
    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    };

    function createDataChannel(connection, label) {
        const channel = connection.createDataChannel(label);
        channel.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "participant") {
                addParticipant(data.name);
            }
        };
        return channel;
    }

    function addParticipant(name) {
        if (!participants.has(name)) {
            participants.set(name, {
                audio: new Audio(),
                volume: 1.0,
            });
            participants = participants; // trigger Svelte reactivity
        }
    }

    function updateVolume(name, volume) {
        const participant = participants.get(name);
        if (participant) {
            participant.volume = volume;
            participant.audio.volume = volume;
            participants = participants; // trigger Svelte reactivity
        }
    }

    async function startConnection() {
        if (!userName.trim()) {
            errorMessage = "Please enter your name first";
            return;
        }
        errorMessage = ""
        try {
            // Get microphone stream
            localStream =
                await navigator.mediaDevices.getUserMedia(constraints);
            status = "Got microphone access";

            // Create peer connections
            localConnection = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });
            remoteConnection = new RTCPeerConnection({
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
            });

            // Set up data channels
            sendChannel = createDataChannel(localConnection, "participants");
            remoteConnection.ondatachannel = (event) => {
                receiveChannel = event.channel;
                receiveChannel.onmessage = (e) => {
                    const data = JSON.parse(e.data);
                    if (data.type === "participant") {
                        console.log("Gotdata participant");
                        addParticipant(data.name);
                    }
                    else {
                        console.log("Gotdata other",data);

                    }
                };
            };

            // Add stream to local connection
            localStream.getTracks().forEach((track) => {
                localConnection.addTrack(track, localStream);
            });

            // Set up ICE handling
            localConnection.onicecandidate = (e) => {
                if (e.candidate) {
                    remoteConnection.addIceCandidate(e.candidate);
                }
            };

            remoteConnection.onicecandidate = (e) => {
                if (e.candidate) {
                    localConnection.addIceCandidate(e.candidate);
                }
            };

            // Set up audio output
            remoteConnection.ontrack = (e) => {
                const participant = participants.get(userName) || {
                    audio: new Audio(),
                    volume: localVolume,
                };
                participant.audio.srcObject = new MediaStream([e.track]);
                participant.audio.volume = participant.volume;
                participant.audio.play().catch(console.error);
                participants.set(userName, participant);
                status = "Audio loopback started";
            };

            // Create and set local description
            const offer = await localConnection.createOffer();
            await localConnection.setLocalDescription(offer);
            await remoteConnection.setRemoteDescription(offer);

            // Create and set remote description
            const answer = await remoteConnection.createAnswer();
            await remoteConnection.setLocalDescription(answer);
            await localConnection.setRemoteDescription(answer);

            // Announce ourselves
            if (sendChannel.readyState === "open") {
                console.log("Sending participant");
                sendChannel.send(
                    JSON.stringify({
                        type: "participant",
                        name: userName,
                    }),
                );
            } else {
                sendChannel.onopen = () => {
                    console.log("Sending participant");
                    sendChannel.send(
                        JSON.stringify({
                            type: "participant",
                            name: userName,
                        }),
                    );
                };
            }

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
    let themain = $state()
    $effect(() => {
        if (themain) {
            themain.style.display = 'initial'
        }
    })

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
        <button on:click={startConnection} disabled={status !== "Disconnected"}>
            Start
        </button>

        <button on:click={stopConnection} disabled={status === "Disconnected"}>
            Stop
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
                        on:input={() => updateVolume(name, participant.volume)}
                    />
                    {(participant.volume * 100).toFixed(0)}%
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
        padding: 0.5rem 1rem;
        cursor: pointer;
        font-size: 13em;
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
        background: #f5f5f5;
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
