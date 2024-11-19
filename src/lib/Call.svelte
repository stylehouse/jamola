<script lang="ts">
    let rem = $state([]);
    function begin() {
        console.log("Began!");
        rem.push("Began");
    }
    $effect(() => {
        console.log("Effecting!");
    });
    import { onDestroy } from "svelte";

    let localConnection;
    let remoteConnection;
    let sendChannel;
    let receiveChannel;
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = "";

    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    };

    // Configure preferred Opus codec
    const audioTransceiverInit = {
        direction: "sendrecv",
        sendEncodings: [{}],
        streams: undefined,
    };

    const configuration = {
        iceServers: [
            {
                urls: "stun:stun.l.google.com:19302",
            },
        ],
    };

    async function startConnection() {
        try {
            // Get microphone stream
            localStream =
                await navigator.mediaDevices.getUserMedia(constraints);
            status = "Got microphone access";

            // Create peer connections
            localConnection = new RTCPeerConnection(configuration);
            remoteConnection = new RTCPeerConnection(configuration);

            // Add stream to local connection
            localStream.getTracks().forEach((track) => {
                localConnection.addTrack(track, localStream);
            });

            // Set up event handlers for ICE candidates
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
                const audio = new Audio();
                audio.srcObject = new MediaStream([e.track]);
                audio.play();
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
        } catch (error) {
            errorMessage = `Error: ${error.message}`;
            status = "Error occurred";
            console.error("Error:", error);
        }
    }

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

        localConnection = null;
        remoteConnection = null;
        localStream = null;
        status = "Disconnected";
        errorMessage = "";
    }

    onDestroy(() => {
        stopConnection();
    });
</script>

<main class="container">

    <div class="controls">
        <button on:click={startConnection} disabled={status !== "Disconnected"}>
            Ring
        </button>

        <button on:click={stopConnection} disabled={status === "Disconnected"}>
            Halt
        </button>
    </div>

    <div class="status">
        <p>Status: {status}</p>
        {#if errorMessage}
            <p class="error">{errorMessage}</p>
        {/if}
        <ul>
            {#each rem as remark}
                <li>{remark}</li>
            {/each}
        </ul>
    </div>
</main>

<style>
    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem;
    }

    .controls {
        display: flex;
        gap: 1rem;
        margin: 2rem 0;
    }

    button {
        padding: 0.5rem 1rem;
        cursor: pointer;
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
    button {
        font-size: 13em;
    }
</style>
