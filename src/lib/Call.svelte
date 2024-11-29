<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { SvelteMap } from "svelte/reactivity";
    import { SignalingClient } from "$lib/ws-client.svelte";
    import { Measuring } from "$lib/measuring.svelte";
    import { parRecorder,retryRecordingUploads } from "$lib/recording";
    import YourName from "./YourName.svelte";
    import YourTitle from "./YourTitle.svelte";
    import { CookedStream, FreshStream, Gainorator } from "./audio.svelte";
    
    let Signaling: SignalingClient;
    let sock = () => Signaling?.socket
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");

    // provided by YourName.svelte
    let userName = $state();
    // title by YourTitle.svelte
    let title = $state();
    // $inspect(title)

    // that we i_par into
    let participants = $state([]);
    // par can .msg()
    let par_msg_handler = {}
    // $inspect(participants)

    // par.bitrate kbps going through par.pc
    // par.latency ms one-way to this peer
    // < for recordings
    // < par.delay the stream. cause a larger buffer
    //    determining where the playhead is with speed|slow. 
    //   so I can tune in different rhythms we can be out of time in
    //    creating slightly different music at each end, necessarily.
    //   or delaying our monitor to occur as our peer experiences our stream arriving
    //    so our playing has to lead the beat but on tape will be on the beat.
    //     might be extra hard since less time to think? or extra fresh...
    let measuring = new Measuring({i_par});
    // it never seems to use more than 266 if given more
    let target_bitrate = 270;
    let localVolume = 0.7;

    // these are good to switch off in DEV
    let activate_recording_reuploading = 0
    let activate_recording = 1
    // < perhaps via insertableStreams we can reuse
    //   the encoded opus that was transmit to us as the recorded copy
    //   user may internet too slow to upload 2x 240kbps (30kBps)
    //   complicated to realise, we'd need YourShareOfRecording.svelte
    //   lest everyone upload everything, at slightly different times
    //   announce_title could come with a timestamp!
    //    so we can make deterministic filenames to request from /upload/...
    //    and non-local recordings wait and check the remote uploaded
    // so everyone simply records and uploads their own localStream
    //  then it's at least not transcoded
    let activate_recording_for_peerIds = [""]
    // < YourShareOfMixing.svelte - hierarchy for large crowds
    //   for when it gets too big to send everyone to everyone direct

    // via p2p datachannel
    // announce title changes
    //  when others connect 
    // title broadcasting kicks in after we have a peer's name
    let could_send_titles = false
    // and we aren't the proponent of it...
    //  meaning once the titler leaves nobody will tell joiners about it
    let not_my_title = null
    // the recording gets grouped by when the title started
    let title_ts = null
    // peers sync their sequenceNumber and segment end time
    //  from the msg:title handler to the ~title reaction to parRecorder
    let title_syncinfo = null
    function we_titlechange(new_title) {
        if (not_my_title == new_title) {
            if (title != new_title) {
                throw "we_titlechange title!title"
            }
            console.log("onchanged to receiving title")
            return
        }
        not_my_title = null
        title = new_title
        title_ts = Date.now()
        title_syncinfo = null
    }
    // they title change
    par_msg_handler['title'] = (par,d) => {
        title = not_my_title = d.title
        title_ts = d.title_ts
        title_syncinfo = d
        console.log(`Received title from ${par.name}: ${title}`)
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
            participants.map(par => {
                announce_title(par)
            })
            
        }
    })
    // ~title -> parRecorder
    $effect(() => {
        if (title) {
            participants.map((par) => {
                if (par.recorder) {
                    let syncinfo = null
                    if (title == not_my_title) {
                        // was remote
                        if (title_syncinfo) {
                            syncinfo = title_syncinfo
                            title_syncinfo = null
                        }
                        else {
                            console.warn("had no title_syncinfo")
                        }
                    }
                    else {
                        if (title_syncinfo) {
                            console.warn("had title_syncinfo but is my title")
                        }
                    }
                    if (syncinfo && syncinfo.title != title) {
                        console.warn("had different titles to syncinfo")
                    }
                    if (syncinfo && syncinfo.title_ts != title_ts) {
                        console.warn("had different title_ts to syncinfo")
                    }
                    console.log(`~title=${title} -> parRecorder `+(syncinfo?"(sync)":""))
                    par.recorder.title_changed({...(syncinfo||{}),title,title_ts})
                }
            });
        }
    })
    function stuff_we_tell_parRecorder() {
        return {
            title,
            title_ts,
            bitrate:target_bitrate,
            i_par,
            sock,
        }
    }

    function stuff_we_tell_parRecorder_via_title_changed() {
        // one of these will know what segment 
        let apar
        participants.map((par) => {
            if (!par.recorder || !par.recorder.is_rolling()) return
            apar = par.recorder
        });
        let time_left = apar && apar.segment_time_left() || 0
        let sequenceNumber = apar && apar.sequenceNumber || 0
        return {
            title,title_ts,
            time_left,sequenceNumber
        }
    }

    // triggers 400ms after a par.name is received, if we own the title
    function announce_title(par) {
        // opens the path for title change to react here from the above effect
        could_send_titles = true
        if (not_my_title == title) return
        if (title == null || title == "untitled") return
        

        par.emit && par.emit(
            "title",
            stuff_we_tell_parRecorder_via_title_changed()
        )
    }
    par_msg_handler['participant'] = (par,{name}) => {
        par.name = name;
        // console.log(`Received name from ${par.peerId}: ${par.name}`)
        
        // give some time 
        setTimeout(() => {
            announce_title(par)
        },400)
    }

    par_msg_handler['latency_ping'] = (par,{timestamp}) => {
        par.emit("latency_pong",{timestamp})
    }
    par_msg_handler['latency_pong'] = (par,{timestamp}) => {
        measuring.handle_latency_pong(par, timestamp);
    }

    // participants exchange names in a webrtc datachannel
    function createDataChannel(par) {
        par.channel = par.pc.createDataChannel("participants");
        // you (eg Measuring) can send messages, they may get dropped
        par.msg = (data) => {
            if (!par.channel || par.channel.readyState != "open") {
                return
            }
            par.channel.send(JSON.stringify(data))
        }
        // like socket.io
        par.emit = (type,data) => {
            par.msg({type,...data})
        }
        // the receiver is this other channel they sent us
        //  I don't know why we have to call it "participants" then
        par.pc.ondatachannel = (event) => {
            event.channel.onmessage = (event) => {
                const data = JSON.parse(event.data);
                let handler = par_msg_handler[data.type]
                if (!handler) {
                    return console.warn(`No handler for par=${par.name} message: `,data)
                }
                // < for some reason we have to seek out the par again at this point
                //   not doing this leads to this.par.name being undefined
                //    much later in parRecorder.uploadCurrentSegment
                //    see "it seems like a svelte5 object proxy problem"
                par = i_par({ peerId: par.peerId });

                handler(par,data)
            };
        };
        // Announce ourselves
        let announce_self = () => {
            // console.log("Sending participant");
            par.emit("participant",{name:userName})
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
            announce_self();
            // console.log(`Data open: ${par.peerId}`);
        };
        par.channel.onclose = () => {
            par.offline = 1;
            delete par.bitrate;
            console.log(`Leaves: ${par.name}`);
        };
    }

    type Participant = {
        peerId:string,
        pc?:RTCPeerConnection,
        name?:string,
        fresh?:CookedStream,
        gain?:Gainorator,
        cooked?:CookedStream,
        audio:HTMLAudioElement
    }
    // read or add new participant (par)
    function i_par({ par, peerId, pc, ...etc }):Participant {
        if (par && peerId == null) {
            if (pc != null) throw 'pc'
            // to relocate a par. see "it seems like a svelte5 object proxy problem"
            peerId = par.peerId
        }
        par = participants.filter((par) => par.peerId == peerId)[0];
        if (pc) {
            if (!par) {
                // new par
                par = { peerId, pc };
                // < the par.audio should probably become a feed to audioContext
                // < does this mean each participant becomes an output stream from the browser?
                par.audioContext = window.an_audioContext ||= new AudioContext()
                par.audio = new Audio();
                par.audio.volume = localVolume;
                // the stream first goes through:
                par.fresh = new FreshStream({par})
                par.cooked = new CookedStream({par})
                par.gain = new Gainorator({par})
                
                // the last effect has nowhere to flow on to
                par.cooked.on_output = (stream) => {
                    // < output via webaudio, not an <audio>
                    // const audioSource = par.audioContext.createMediaStreamSource(stream);
                    // const audioDestination = par.audioContext.createMediaStreamDestination();
                    // audioSource.connect(audioDestination);
                    // par.audio.srcObject = audioDestination.stream;
                    
                    par.audio.srcObject = stream;

                    console.log(`on_output is: ${par.name}`)

                    // also, now is a good time to:
                    par.audio.play().catch(console.error);
                    might_hit_play_on_par_recorder(par)
                }

                par.pc && measuring.add_par(par);
                if (activate_recording && (!activate_recording_for_peerIds
                        || activate_recording_for_peerIds.includes(par.peerId))) {
                    // they record (.start()) when a track arrives
                    par.recorder = new parRecorder({par:par,...stuff_we_tell_parRecorder()})
                }

                participants.push(par);
            } else {
                // stream|par.pc changes, same par|peerId
                //  peerId comes from socket.io, is per their websocket
                console.log(`i_par: stream changes, same peer: ${par.name}`)
                // hangup, change userName, Ring again causes this branch as you re-connect to each par
                // bitratestats will notice this change itself
                if (par.pc == pc) debugger;
                // Stop existing recording if we're replacing the connection
                //  it needs to be started again on a new MediaStream
                // < will it?
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
    // the one place to start recordings
    // occurs two ways:
    //  usually, streams arriving cause a par.cooked.on_output()
    //  the local stream only "arrives" and causes that once though
    //   so we also do this in i_myself_par(), as we reconnect (reRing)
    // < we should be able to record audio without a connection! an offline webapp.
    function might_hit_play_on_par_recorder(par) {
        console.log(`Might start recorder, par.name`)
        if (!par.recorder) return
        if (!par.audio.srcObject) return
        if (par.recorder.is_rolling()) return
        // < take the recording just after par.gain and par.delay
        //    but before par.reverb|echo and the messier|refinable effects
        //    and apply|refine the later effects on listen...
        //     ie in post ie post-production, which can mean any treatment not live
        //    since it's better to record clear audio
        //     and make it into a reverb cloud after decoded
        console.log(`Will start recorder, par.name`)
        par.recorder.start(par.audio.srcObject);
    }
    // this becomes our monitor
    function i_myself_par() {
        let par = i_par({
            peerId: "",
            pc: {},
            name: userName,
            type: "monitor",
        });
        delete par.pc;
        if (!par.audio.srcObject) {
            let many = []
            localStream.getTracks().forEach((track) => {
                many.push(track)
            });
            if (many.length != 1) {
                console.warn(`odd number of tracks`,many)
            }
            par.fresh.input(new MediaStream([many[0]]))
            par.audio.volume = 0;
        }
        might_hit_play_on_par_recorder(par)
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
    // find input devices onload
    let possible_audio_input_devices = $state()
    $inspect("possible_audio_input_devices",possible_audio_input_devices)
    $effect(async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        possible_audio_input_devices = devices.filter(device => 
            device.kind === 'audioinput' && device.label !== ''
        );
        if (!possible_audio_input_devices.length) {
            errorMessage = "Looks like you have no audioinput devices."
        }
    })
    let chosen_audio_device = null
    function choose_audio_input_device(deviceId) {
        console.log("switching to deviceId="+deviceId)
        chosen_audio_device = deviceId
        // If we're currently in a call, we need to switch devices
        if (localStream) {
            // Stop all tracks on the current stream
            localStream.getTracks().forEach(track => track.stop());
            
            // Reset localStream to force a new getUserMedia call
            localStream = null;
            
            // If currently connected, we'll need to rebuild connections
            if (status !== "Disconnected") {
                // Stop current connections
                stopConnection();
                
                // Restart connection with new device
                setTimeout(() => {
                    negate(); // This will restart the connection
                }, 100);
            }
        }
    }
    async function startStreaming() {
        if (!localStream) {
            // they might choose a stream, null for default
            constraints.audio.deviceId = chosen_audio_device
            // Get microphone stream
            localStream ||=
                await navigator.mediaDevices.getUserMedia(constraints);
            status = "Got microphone access";
        }
        // every-Ring stuff
        i_myself_par();
    }
    async function startConnection() {
        // this will be, sync, after negate()
        status = "Plugging out";
        let part = ''
        errorMessage = "";
        try {
            part = 'startStreaming'
            await startStreaming()
            // start signaling via websocket to bootstrap webrtc sessions...
            if (Signaling) {
                // should have been packed up
                debugger;
                Signaling.close();
            }
            part = 'Signaling'
            Signaling = new SignalingClient({
                on_peer: ({ peerId, pc }) => {
                    part = 'on_peer'
                    // a peer connection, soon to receive tracks, name etc
                    let par = i_par({ peerId, pc });

                    // watch it become 'connected' (or so)
                    wait_for_par_ready(par, () => {
                        console.log("Par ready! " + par.peerId);

                        part = 'give_localStream'
                        // input our stream to it
                        give_localStream(par);

                        part = 'take_remoteStream'
                        // take audio from it
                        take_remoteStream(par);

                        // Set up data channel to send names
                        part = 'createDataChannel'
                        createDataChannel(par);
                    });
                },
            });
        } catch (error) {
            errorMessage = `Error in ${part}: ${error.message}`;
            status = "Error occurred";
            console.error(`Error in ${part}:`, error);
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
            par.fresh.input(new MediaStream([e.track]))
            // console.log("Got track", [par, par.audio.srcObject, localStream]);
            // this is usually the status while connected
            status = "Got things";
        };
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
        measuring.close();
        let let_go = () => {
            Signaling && Signaling.close();
            Signaling = null;
        }
        participants.map(par => {
            par.pc?.close && par.pc?.close();
            if (par.recorder) {
                par.recorder.stop(let_go)
            }
            par.audio.pause();
            par.audio.srcObject = null;
        });

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
    function negate() {
        if (status === "Disconnected") {
            if (!userName.trim()) {
                errorMessage = "Please enter your name first";
                return;
            }
            startConnection();
            if (status === "Disconnected") {
                throw "we rely on this instantly changing"
            }
            say_negate = "leave";
        } else {
            stopConnection();
            say_negate = "Ring";
        }
    }
    // auto-resume - good for debugging when all clients refresh all the time
    let resumable_once = true;
    let resumable_storable = $state(false)
    $effect(() => {
        if (resumable_once) {
            // init
            resumable_once = false;
            // wait for navigator.mediaDevices.enumerateDevices
            setTimeout(() => {
                if (localStorage.was_on && userName != "you" && !errorMessage) {
                    console.log("Resuming...");
                    negate()
                }
                resumable_storable = 1
            },240)
        }
    });
    // after the above, or it will store the default was_on=false
    $effect(() => {
        if (resumable_storable) {
            if (status === "Disconnected") {
                delete localStorage.was_on;
            } else {
                localStorage.was_on = "call";
            }
        }
    });

    //
    let quitervals = []
    $effect(() => {
        let retry = () => activate_recording_reuploading && Signaling && retryRecordingUploads(sock)
        setTimeout(() => {
            // Periodically retry failed uploads, eg now
            retry()
            // And every 5 minutes
            quitervals.push(setInterval(retry, 5 * 60 * 1000));
        }, 3000)
    })
    function lets_upload() {
        status = "Ping"
        console.log("Ya"+2 )
    }
    onDestroy(() => {
        quitervals.map(clearInterval)
        stopConnection();
    })
</script>

<main class="container" style="display:none;" bind:this={themain}>
    <h1>
        <span class="welcometo overhang">Welcome to</span>
        <span class="jamola"><a href="https://github.com/stylehouse/jamola">jamola</a></span>,
        <span style="display:inline-block">
                <YourName bind:userName={userName} 
                    editable={status == "Disconnected"}
                    {negate}
                ></YourName>
            <span style="font-size:24%">!</span></span>
    </h1>

    <div class="controls">
        <button onclick={negate}>
            {say_negate}
        </button>
        <button onclick={lets_upload}>
            🍇
        </button>
    </div>
    <div class="controls">

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
        <label>
            <span class="overhang">input</span>
            <select
                onchange={(e) => choose_audio_input_device(e.target.value)}
            >
                {#each possible_audio_input_devices as device}
                    
                    <option value="{device.deviceId}">{device.label}</option>
                {/each}
            </select>
        </label>

    </div>
    <div class="controls">
        <p class="status">{status}</p>
    </div>
    {#if errorMessage}
    <div class="controls">
        <p class="error">{errorMessage}</p>
    </div>
    {/if}
    <div class="participants">
        <YourTitle {title} editable={status != "Disconnected"} onChange={we_titlechange}/>


        {#each participants as par (par.peerId)}
            <div class="participant {par.type == 'monitor' && 'monitor'}">
                <span class="theyname">{par.name || par.peerId}</span>
                {#if par.type}<span class="streamtype">{par.type}</span>{/if}
                {#if par.offline}<span class="error">offline</span>{/if}
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
                {#if par.latency}<span class="bitrate latency">{par.latency} ms</span
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
        display:block;
    }

    .setup {
        margin: 1rem 0;
    }
    select {
        max-width:3em;
    }
    select option {
        background-color: #111b17;
        color: #a89e89;
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
    .bitrate {
        width:2em;
    }
    .latency {
        color:#2d0768
    }

    input[type="range"] {
        width: 150px;
    }

    input[type="text"] {
        padding: 0.5rem;
        width: 200px;
    }
</style>
