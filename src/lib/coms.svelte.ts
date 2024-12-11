

// participants exchange names in a webrtc datachannel
// one is attached to the par:
export function createDataChannel({par,par_msg_handler,userName,i_par}) {
    let original = !par.channel
    par.channel ||= par.pc.createDataChannel("participants");

    // you (eg Measuring) can send messages.
    // like socket.io
    par.emit = (type,data) => {
        if (!par.channel || par.channel.readyState != "open") {
            return
        }
        par.channel.send(JSON.stringify({type,...data}))
    }
    // the receiver is this other channel they sent us
    // put handlers of replies in par_msg_handler.$type
    par.pc.ondatachannel = ({channel}) => {
        par.their_channel = channel
        par.their_channel.onmessage = (event) => {
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
    let announce_self = () => {
        par.emit("participant",{name:userName})
        // once
        announce_self = () => {};
    };
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