<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { SignalingClient } from "$lib/ws-client.svelte";
    import { BitrateStats } from "$lib/bitratestats.svelte";
    import { parRecorder,retryRecordingUploads } from "$lib/recording";
    import YourName from "./YourName.svelte";
    import YourTitle from "./YourTitle.svelte";
    
    let Signaling: SignalingClient;
    let sock = () => Signaling?.socket
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");

    // provided by YourName.svelte
    let userName = $state();
    // title by YourTitle.svelte
    let title = $state();

    // that we i_par into
    let participants = $state([]);

    let bitrates = new BitrateStats({i_par});
    // it never seems to use more than 266 if given more
    let target_bitrate = 270;
    let localVolume = 0.7;

    // these are good to switch off in DEV
    let activate_uploading = 0
    let activate_recording = 0

    // via p2p datachannel
    // announce title changes
    //  when others connect 
    // < on mynameis, dom titler sends title to newbie
    // < on ~title here 1s after page load
    // title broadcasting kicks in after we have a peer's name
    let could_send_titles = false
    // and we aren't the proponent of it...
    //  meaning once the titler leaves nobody will tell joiners about it
    let not_my_title = null
    function we_titlechange(new_title) {
        if (not_my_title == new_title) {
            if (title != new_title) {
                debugger
            }
            console.log("onchanged to receiving title")
            return
        }
        not_my_title = null
        title = new_title
    }
    function they_titlechange(new_title) {
        title = not_my_title = new_title
    }
    $effect(() => {
        if (title && title != "untitled") {
            if (!could_send_titles) {
                // console.log("Early to be titled")
                return
            }
            if (title == untrack(() => not_my_title)) {
                // console.log("Reacted to received title")
                return
            }
            console.log("Tell all title="+title)
            participants.map(par => {
                console.log(` - tell par=${par.name}`)
                announce_title(par)
            })
            
        }
    })
    // triggers 400ms after a par.name is sent
    function announce_title(par) {
        // opens the value for title change to react here from the above effect
        could_send_titles = true
        if (not_my_title == title) return
        if (title == null || title == "untitled") return
        if (!par.channel || par.channel.readyState != "open") {
            return
        }
        console.log(` - tell par=${par.name}`)
        par.channel.send(
            JSON.stringify({
                type: "title",
                title: title,
            }),
        );
    }

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
                    console.log(`Received name from ${par.peerId}: ${par.name}`)
                    
                    // give some time 
                    setTimeout(() => {
                        announce_title(par)
                    },400)
                }
                if (data.type === "title") {
                    they_titlechange(data.title)
                    console.log(`Received title from ${par.name}: ${title}`)
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
    function i_par({ par, peerId, pc, ...etc }):Participant {
        if (par && peerId == null) {
            if (pc != null) throw 'pc'
            // to relocate a par. see "it seems like a svelte5 object proxy problem"
            peerId = par.peerId
        }
        par = participants.filter((par) => par.peerId == peerId)[0];
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
                if (activate_recording) {
                    // they record
                    par.recorder = new parRecorder({par:par,...stuff_we_tell_parRecorder()})
                }
            } else {
                was_new = 1;
                // stream|par.pc changes, same par|peerId
                //  peerId comes from socket.io, is per their websocket
                console.log(`i_par: stream changes, same peer: ${par.name}`)
                // hangup, change userName, Ring again causes this branch as you re-connect to each par
                // bitratestats will notice this change itself
                if (par.pc == pc) debugger;
                // Stop existing recording if we're replacing the connection
                //  it needs to be started again on a new MediaStream
                if (par.recorder) {
                    par.recorder.stop();
                }
                par.pc?.close && par.pc?.close();
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
            title,
            bitrate:target_bitrate,
            i_par,
            sock,
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
            par.pc?.close && par.pc?.close();
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

    // title by YourTitle, can percolate to parRecorder
    $effect(() => {
        if (title) {
            participants.map((par) => {
                if (par.recorder) {
                    par.recorder.title_changed(title)
                }
            });
        }
    })
    //
    let quitervals = []
    $effect(() => {
        let retry = () => activate_uploading && Signaling && retryRecordingUploads(sock)
        setTimeout(() => {
            // Periodically retry failed uploads, eg now
            retry()
            // And every 5 minutes
            quitervals.push(setInterval(retry, 5 * 60 * 1000));
        }, 3000)
    })
    function lets_upload() {
        // retryRecordingUploads()
        
        console.log("Ya"+2 )
    }
    // $inspect(participants)
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
        <YourName bind:userName={userName} editable={status == "Disconnected"} {negate} ></YourName>
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
        <YourTitle {title} editable={status != "Disconnected"} {Signaling} onChange={we_titlechange}/>


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
    .yourtitle {
        font-size: 170%;
        color: rgb(54, 19, 19);
        text-shadow: 5px 3px 9px #aca;
    }

    .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem;
    }

    .setup {
        margin: 1rem 0;
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
