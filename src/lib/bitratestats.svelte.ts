export class BitrateStats {
    statsIntervals = new Map()
    constructor() {
    }
    // Add stats monitoring function
    add_par(par) {
        console.log(`Statsing Par: ${par.name}  ${par.peerId}`)
        if (this.statsIntervals.has(par.peerId)) {
            clearInterval(this.statsIntervals.get(par.peerId));
            this.statsIntervals.delete(par.peerId);
        }
        const interval = setInterval(async () => {
            if (!par.pc || par.pc.connectionState !== "connected") return;

            try {
                const stats = await par.pc.getStats();
                stats.forEach((stat) => {
                    // Look for inbound-rtp stats for audio
                    if (stat.type === "inbound-rtp" && stat.kind === "audio") {
                        const now = stat.timestamp;
                        const bytes = stat.bytesReceived;

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
            } catch (error) {
                console.error("Error getting stats:", error);
            }
        }, 1000); // Update every second

        this.statsIntervals.set(par.peerId, interval);
    }
    close() {
        // Clear all stats intervals
        this.statsIntervals.forEach((interval) => clearInterval(interval));
        this.statsIntervals.clear();
    }
}