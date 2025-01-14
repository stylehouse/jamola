<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import { Measuring } from "$lib/measuring.svelte";
    import { parRecorder,retryRecordingUploads } from "$lib/recording";
    import YourName from "./YourName.svelte";
    import YourTitle from "./YourTitle.svelte";
    import { CookedStream, Delaysagne, FreshStream, Gainorator, Gaintrol } from "./audio.svelte";
    import { oncer, retryUntil, throttle, userAgent } from "./Y";
    import { Party } from "./kolektiva/Party.svelte";
    import Participants from "./ui/Participants.svelte";
    
    let sock = () => party?.socket?.connected && party.socket
    let localStream;
    let status = $state("Disconnected");
    let errorMessage = $state("");

    // provided by YourName.svelte
    let userName = $state();
    // title by YourTitle.svelte
    let title = $state();
    $inspect('title',title)

    let participants = $state(new Party());
    let party = participants
    // < refactor this into party.forever.*
    $effect(() => {
        if (userName) {
            party.userName = userName
        }
    })
    $effect(() => {
        // parties keep going in the background on HMR unless we:
        party.singularise()
    })
    
    // par can .msg()
    let par_msg_handler = party.par_msg_handler = {}
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
    let measuring = party.measuring = new Measuring({party});
    // it never seems to use more than 266 if given more
    let target_bitrate = 270;
    let default_volume = 0.7;
    
    // < HMR can sort-of be listened for
    $effect(() => {
        if (import.meta.hot) {
            import.meta.hot.accept((mod) => {
                let of = {
                    // always rather opaque
                    mod,
                    // always Call.svelte?t=...
                    url:import.meta.url,
                    // empty, guesses from AI at what it would expect to be here?
                    hot:import.meta.hot,
                    id:import.meta.hot.id,
                }
                console.log("Codechange!", of)
            })
            // if you write these as import.meta.hot.accept(
            //  it compiles in a ['default'] as a first argument
            //  and an error about our strings being a callback occurs elsewhere
            // so svelte must be obscuring vite's advertised feature of thus:
            let imh = import.meta.hot
            // none of these work?
            imh.accept('/src/lib/kolektiva/Party.svelte', (newFoo) => {
                console.log("Party Codechange!", {url:import.meta.url,newFoo})
            })
            imh.accept('kolektiva/Party.svelte', (newFoo) => {
                console.log("Party short Codechange!", {url:import.meta.url,newFoo})
            })
            imh.accept('./kolektiva/Party.svelte', (newFoo) => {
                console.log("Party ./short Codechange!", {url:import.meta.url,newFoo})
            })
        }
        else {
            throw "never here"
        }
    })
    // these are good to switch off in DEV
    let activate_recording_reuploading = 2
    
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
    let title_syncinfo = $state(null)
    function we_titlechange(new_title) {
        if (not_my_title == new_title) {
            if (title != new_title) {
                throw "we_titlechange title!title"
            }
            // console.log("onchanged to receiving title")
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
            party.everyone(par => {
                announce_title(par)
            })
            
        }
    })
    // ~title -> parRecorder
    $effect(() => {
        if (title || title_syncinfo) {
            participants.map((par) => {
                if (par.recorder) {
                    let syncinfo = null
                    // we may receive the same title if we reload the page
                    if (!title_syncinfo && par.recorder.title == title) return
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
    participants.stuff_we_tell_parRecorder = () => {
        return {
            title,
            title_ts,
            bitrate:target_bitrate,
            party,
            sock,
        }
    }
    function stuff_we_tell_parRecorder_via_title_changed() {
        // one of these will know what segment the group is up to
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
        console.log(`Received name from ${par.peerId}: ${par.name}`)

        // this is a dependency of:
        party.peering.couldbeready(par)
        
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

    // life and times
    

    // this becomes our monitor
    function i_myself_par() {
        let par = party.createPar({
            name: userName,
            type: "monitor",
            // < better than type:monitor is:
            local: true,
        });
        // is ready immediately?
        // doesn't seem to be...
        setTimeout(() => {
            //  create effects!
            par.on_ready()
            if (!par.fresh.stream) {
                if (!localStream) {
                    debugger
                }
                par.fresh.input(localStream)
            }
            par.may_record()
        },111)
    }


    party.setup_par_effects = (par) => {
        // the microphone domesticator
        par.gain = new Gainorator({par})
        par.delay = new Delaysagne({par})
        // how much goes into the mix you hear
        par.vol = new Gaintrol({par})

        let hear = par.local ? 0 : default_volume
        par.vol.set_gain(hear)
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
    async function enumerateDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log("Yer devices: ", devices)
        possible_audio_input_devices = devices.filter(device => 
            device.kind === 'audioinput' && device.label !== ''
        );
        return
        // < this will probably just confuse people unless we do it later?
        if (!possible_audio_input_devices.length) {
            let ua = userAgent()
            if (ua == 'Firefox') {
                // Firefox doesn't let this info out before your actual request for a mic
            }
            else if (ua == 'Safari') {
                errorMessage = "Please grant audio permissions (try the icons in the address bar, eg AA)."
            }
            else {
                errorMessage = "Looks like you have no audio devices, you should try anyway"

            }
        }
    }
    $effect(async () => {
        enumerateDevices()
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
        console.log(`startConnection()`)
        // this will be, sync, after negate()
        status = "Plugging out";
        let part = ''
        errorMessage = "";
        try {
            part = 'startStreaming'
            await startStreaming()
            part = 'Peering'
            // start signaling via websocket to bootstrap webrtc sessions...
            party.start()
        } catch (error) {
            errorMessage = `Error in ${part}: ${error.message}`;
            status = "Error occurred";
            console.error(`Error in ${part}:`, error);
        }
    }




    // take audio from a peer
    party.status_msg = (s) => status = s
    function take_remoteStream(par) {
        par.pc.ontrack = (e) => {
            // < multiple tracks
            
            par.fresh.input(e.streams[0])
            // par.audio.srcObject = e.streams[0]
            // par.audio.play()
            // console.log("Got track", [par, par.audio.srcObject, localStream]);
            // this is usually the status while connected
            status = "Got things";
        };
    }


    // was give_localStream
    // the user has some tracks to give to everyone in here
    // < it could be per par, avoid sending to non-mixing nodes etc
    // < numerous local par could exist
    //    from devices or synthesisers|players
    //    tracks should be sourced from their effect chain as a send|tape
    //    and added to localStream, which should then readd tracks for all par
    //     > sending your track to a remote distortion pedal, and getting it back
    party.get_localStream = () => localStream
    // after tracks are added, they bitrate adjust here:
    party.on_addTrack = async (par, track, sender) => {
        if (track.kind === "audio") {
            try {
                // First wait for track to be ready
                await retryUntil(
                    () => track.readyState === 'live',
                    {
                        name: `${par} waitForTrack`,
                        baseDelay: 22
                    }
                );

                // Now wait for transport setup and set bitrate
                await setAudioBitrate(sender, target_bitrate);
            } catch (error) {
                console.error(`${par} Failed to set bitrate:`, error);
            }
        }
    }

    async function setAudioBitrate(sender, bitrate) {
        // First wait for encodings to be available
        await retryUntil(
            async () => {
                const params = sender.getParameters();
                if (params.encodings?.length) {
                    return params;
                }
                // Check connection state
                console.log('Current states:', {
                    iceConnectionState: sender.transport?.iceConnectionState,
                    dtlsState: sender.transport?.dtlsState,
                    params: params
                });
                return false;
            },
            { 
                name: 'waitForEncodings',
                baseDelay: 11
            }
        );

        // Now we know we have encodings, set the bitrate
        const params = sender.getParameters();
        params.encodings[0].maxBitrate = bitrate * 1000; // Convert kbps to bps
        await sender.setParameters(params);
        console.log(`setAudioBitrate: ${bitrate}`, {params, sender});
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
        console.log(`stopConnection()`)
        measuring.close();
        party.stop()
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
    // button's word changes
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
            party.was_on = true
            say_negate = "leave";
        } else {
            stopConnection();
            party.was_on = false
            say_negate = "Ring";
        }
    }

    // reset on HMR, as is everything in here, if no separated by a component
    //  see https://howsecologysquad.blogspot.com/2025/01/svelte-hmr.html
    let load_once = oncer()
    $effect(() => {
        if (load_once()) {
            party.load_config()
        }
    })
    let dont_save_once = oncer()
    $effect(() => {
        // gets reactive variables in it, updating via this effect
        party.save_config(dont_save_once())
    })

    // auto-resume - good for debugging when all clients refresh all the time
    let resumable_once = oncer()
    $effect(() => {
        if (resumable_once()) {
            // init
            // wait for navigator.mediaDevices.enumerateDevices
            // < actually wait for it, ie no longer
            //    suppose we separate our localstream + mixer of them to...
            setTimeout(() => {
                if (party.was_on && userName != "you" && !errorMessage) {
                    console.log("Resuming...");
                    negate()
                }
            },240)
        }
    });

    //
    let quitervals = []
    $effect(() => {
        let retry = () => {
            activate_recording_reuploading
                && sock() && retryRecordingUploads(sock)
        }
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
    let dead = false
    onDestroy(() => {
        quitervals.map(clearInterval)
        stopConnection();
        dead = true
    })

</script>

<main class="container" style="display:none;" bind:this={themain}>
    <h1>
        <span class="welcometo overhang">Welcome to</span>
        <span class="jamola"
            ><a href="https://github.com/stylehouse/jamola">jamola</a></span
        >,
        <span style="display:inline-block">
            <YourName bind:userName editable={status == "Disconnected"} {negate}
            ></YourName>
            <span style="font-size:24%">!</span></span
        >
    </h1>

    <div class="controls">
        <button onclick={negate}>
            {say_negate}
        </button>
        <button onclick={lets_upload}> 🍇 </button>
        {#if party.wants_audio_permission}
            !<button onclick={party.wants_audio_permission}>Enable Audio</button>!
        {/if}
        <label>
            <!-- onchange={() => activate_recording = activate_recording_checkbox} -->
            <input type="checkbox" bind:checked={party.activate_recording} />
            rec
        </label>
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
                onpointerdown={() => enumerateDevices()}
            >
                {#each possible_audio_input_devices as device}
                    <option value={device.deviceId}>{device.label}</option>
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
        <YourTitle
            {title}
            editable={status != "Disconnected"}
            onChange={we_titlechange}
        />
    </div>
    <Participants {party}></Participants>
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
        color: inherit;
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
        display: block;
    }

    .setup {
        margin: 1rem 0;
    }
    select {
        max-width: 3em;
    }
    select option {
        background-color: #111b17;
        color: #a89e89;
    }

    input[type="range"] {
        width: 150px;
    }

    input[type="text"] {
        padding: 0.5rem;
        width: 200px;
    }
</style>
