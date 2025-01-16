import type { Party } from "./kolektiva/Participants.svelte"
import { erring } from "./Y"

export class Measuring {
    statsIntervals = new Map()
    party:Party
    constructor(opt) {
        Object.assign(this,opt)
        this.bitrates = new BitrateStats()
        this.latency = new LatencyStats()
    }
    // Add stats monitoring function
    add_par(par) {
        if (this.statsIntervals.has(par.peerId)) {
            clearInterval(this.statsIntervals.get(par.peerId));
            this.statsIntervals.delete(par.peerId);
        }
        const interval = setInterval(async () => {
            // to relocate a par. see "it seems like a svelte5 object proxy problem"
            par = this.party.repar(par)
            if (!par) {
                // < this class should do 1 interval
                console.log("Not anymore!")
                return
            }
            // make all of these measurements depend on them being connected
            // < this may prevent us firing pings?
            if (!par.pc || par.pc.connectionState !== "connected") return;
            
            this.per_par(par)
        }, 1000); // Update every second

        this.statsIntervals.set(par.peerId, interval);
    }
    close() {
        // Clear all stats intervals
        this.statsIntervals.forEach((interval) => clearInterval(interval));
        this.statsIntervals.clear();
    }
    per_par(par) {
        this.per_par_measure(par,this.bitrates)
        this.per_par_measure(par,this.latency)
        
    }
    // this can go async from above each time, so stat jobs go in parallel?
    async per_par_measure(par,meas) {
        try {
            await meas.per_par(par)
        } catch (error) {
            throw erring(`Error measuring {par.name} with ${meas}`, error);
        }
    }

    // interfaces for other occasions than per_par
    handle_latency_pong(par, ts) {
        this.latency.handle_latency_pong(par, ts)
    }
}
type ParticipantWithLatency = {name,latency_stats_i:number,latency:number}
type peerId = string
export class LatencyStats {
    private pingTimeouts: Map<peerId, NodeJS.Timeout> = new Map();
    async per_par(par) {
        // here every 1s
        let stat_delta = 3
        par.latency_stats_i ||= 1
        if (par.latency_stats_i++ % stat_delta) {
            return
        }
        // here every 3s
        // console.log(`latency del ${par.name}`)

        const startTime = Date.now();
        // will become a ping timeout if unsendable
        par.emit("latency_ping", {timestamp: startTime})

        // Set a timeout to detect potential packet loss
        let timeout_delta = 3
        const timeoutId = setTimeout(() => {
            // we never cancel these so each checks for a recent ping
            if (par.last_pong_ts < Date.now() - timeout_delta*1000) {
                console.warn(`Latency ping timeout for ${par.name || par.peerId}`);
            }
        }, timeout_delta*1000);

        this.pingTimeouts.set(par.peerId, timeoutId);
    }

    handle_latency_pong(par, ts) {
        let round_trip = Date.now() - ts
        // latency is in seconds, as are other par.*Stat.*
        par.latency = (round_trip / 2) / 1000
        par.last_pong_ts = Date.now()
        const timeoutId = this.pingTimeouts.get(par.peerId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.pingTimeouts.delete(par.peerId);
        }
    }
}

export class BitrateStats {
    async per_par(par) {
        const stats = await par.pc.getStats();
        
        stats.forEach((stat) => {
            if (stat.kind != "audio") return
            // < every 5s, copy this into user data
            //    and sync that with the server, for remote diagnostics
            if (stat.type === "outbound-rtp") {
                this.gatherstat(par,stat,{
                    t:'send',
                    copy: [
                        'totalPacketSendDelay',   // Time between packet generation and transmission
                        'encoderDelay',           // Time spent encoding
                        'targetBitrate',          // Target sending rate
                        'packetsSent',            // Total packets sent
                        'retransmittedPackets',   // Packets that had to be resent
                        'packetsDiscardedOnSend', // Packets dropped before sending
                        'totalEncodedBytesTarget',// Desired encoded size
                        'avgEncodeTime',          // Average time to encode frames
                        'qualityLimitationReason',// Target sending rate
                        'nackCount',              // Number of negative acknowledgments received
                    ]
                })
            }
            if (stat.type === "inbound-rtp") {
                this.gatherstat(par,stat,{
                    t:'receive',
                    copy: [
                        'interarrivalJitter',     // Variation in packet arrival times
                        'jitterBufferDelay',      // Time spent in receiver's buffer
                        'jitterBufferEmittedCount',    // Frames played out from buffer
                        'jitterBufferMinimumDelay',    // Minimum time packets stay in buffer
                        'jitterBufferTargetDelay',     // Desired buffer delay
                        'packetsLost',            // Lost packets on receive side
                        'packetsDiscarded',       // Packets dropped (might indicate buffer overflow)
                        'concealedSamples',       // Audio gaps that needed to be filled
                        'insertedSamplesForDeceleration', // Added samples to slow down playback
                        'removedSamplesForAcceleration',  // Removed samples to speed up playback
                    ]
                })
            }

            if (stat.type === "candidate-pair" && stat.nominated) {
                let cS = par.candiStat ||= {}
                cS.currentRoundTripTime = stat.currentRoundTripTime;
                cS.availableOutgoingBitrate = stat.availableOutgoingBitrate;
                cS.priority = stat.priority;
                cS.transportType = stat.transportType;
            }
        });

        if (par.sendStat && par.receiveStat) {
            par.bitrate = par.sendStat.bitrate
            // < tune time machine
            par.totalLatency =
                (par.latency||0) +                       // Network transit time (RTT/2)
                par.sendStat.totalPacketSendDelay + // Sender queuing
                par.receiveStat.jitterBufferDelay;  // Receiver buffering
        }
        else {
            delete par.bitrate
            delete par.totalLatency
        }

    }
    gatherstat(par,stat,instruct) {
        // we have an instance of this function's memory per in,out
        let t = instruct.t+"Stat"
        let report = par[t] ||= {}
        const now = stat.timestamp;
        const bytes = t == 'sendStat' ? stat.bytesSent : stat.bytesReceived;
        if (bytes < report.lastByteCount) {
            // par.pc must have been replaced
            report.lastByteCount = 0
        }

        if (report.lastTimestamp > 0) {
            // Calculate bitrate in kbps
            const deltaTime = now - report.lastTimestamp;
            const deltaBytes = bytes - report.lastByteCount;
            report.bitrate = Math.round(
                (deltaBytes * 8) / deltaTime,
            ); // bits per second
        }

        report.lastByteCount = bytes;
        report.lastTimestamp = now;

        // each has particulars
        instruct.copy.map(k => {
            report[k] = stat[k]
        })
    }
}