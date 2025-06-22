<script lang="ts">
    let {par} = $props();
    let on = $state(false)
    function Hi() {
        on = !on
    }
    $effect(() => {
        par.gain.signal_sample && 1
        if (!on) return
        // this effect starts|stops reacting to:
        Hiing(
            par.gain.signal_sample,
            par.gain.volumeLevel
        )
    })
    
    // Fast MD5 implementation?
    function fastMD5(data: Uint8Array): string {
        const hex = Array.from(data.slice(0, 8), b => b.toString(16).padStart(2, '0')).join('');
        let h = 0x12345678;
        for (let i = 0; i < hex.length; i++) {
            h = Math.imul(h ^ hex.charCodeAt(i), 0x5bd1e995);
            h ^= h >>> 15;
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }
    
    let etc = $state()
    let buttonStyle = $state()
    function Hiing(arr: Uint8Array,volume) {
        // convert 8 nibbles from Uint8Array to a stable rainbow based on MD5
        if (!arr || arr.length < 8) return;
        
        // Get stable hash of the first 8 bytes
        const hash = fastMD5(arr);
        const hashBytes = [];
        for (let i = 0; i < 8; i++) {
            hashBytes.push(parseInt(hash.substr(i, 1), 16));
        }
        
        // Create stable rainbow gradient stops based on hash
        const gradientStops = hashBytes.map((hashVal, index) => {
            const hue = (hashVal * 23.68) % 360; // Use hash to determine hue
            const saturation = 70 + (hashVal / 15) * 30; // 70-100% based on hash nibble
            const lightness = 45 + (volume / 1) * 25; // 45-70% based on RMS volume
            const position = (index / 7) * 100;
            
            return `hsl(${hue}, ${saturation}%, ${lightness}%) ${position}%`;
        }).join(', ');
        
        buttonStyle = `background: linear-gradient(90deg, ${gradientStops});`;
        etc = ` ${hash.slice(0, 8)}`; // Show first 8 chars of hash
    }
</script>

<button style={buttonStyle} onclick={()=>Hi()}>Hi</button>

<style>
    button {
        font-size:2em;
    }
</style>