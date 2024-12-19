import type { Party } from "./kolektiva/Participants.svelte"

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
            console.error(`Error measuring {par.name} with ${meas}:`, error);
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
        if (par.channel.readyState == 'open') {
            par.channel.send(JSON.stringify({
                type: "latency_ping",
                timestamp: startTime
            }));
        }
        else {
            // will become a ping timeout (that we didn't send)
            // if it misses two more chances before:
        }

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
        par.latency = round_trip / 2
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
            // Look for inbound-rtp stats for audio
            if (stat.type === "inbound-rtp" && stat.kind === "audio") {
                const now = stat.timestamp;
                const bytes = stat.bytesReceived;
                if (bytes < par.lastByteCount) {
                    // par.pc must have been replaced
                    par.lastByteCount = 0
                }

                if (par.lastTimestamp > 0) {
                    // Calculate bitrate in kbps
                    const deltaTime = now - par.lastTimestamp;
                    const deltaBytes = bytes - par.lastByteCount;
                    par.bitrate = Math.round(
                        (deltaBytes * 8) / deltaTime,
                    ); // bits per second
                }

                par.lastByteCount = bytes;
                par.lastTimestamp = now;
            }
        });
    }
}