
export function userAgent() {
    console.log("navigator.userAgent",navigator.userAgent)
    return navigator.userAgent.includes('Firefox/') ? 'Firefox'
        : navigator.userAgent.includes('Safari/')
            && !navigator.userAgent.includes('Chrome/') ? 'Safari'
        : 'Chrome'
}

export async function retryUntil(condition, options = {}) {
    const {
        baseDelay = 222,
        maxDelay = 3000,
        maxRetries = 15,
        jitterFactor = 0.2,
        name = 'retryUntil'
    } = options;

    let retries = 0;

    while (retries < maxRetries) {
        const result = await condition();
        if (result) return result;

        const exponentialDelay = baseDelay * Math.pow(2, retries);
        const jitter = exponentialDelay * jitterFactor * Math.random();
        const delay = Math.min(exponentialDelay + jitter, maxDelay);

        console.log(`${name}: Retry ${retries + 1}/${maxRetries}: Waiting ${Math.round(delay)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
    }
    
    throw new Error(`${name}: Max retries (${maxRetries}) reached`);
}
export function oncer() {
    let ready = true
    return () => {
        if (ready) {
            ready = false;
            return true
        }
    }
}
export function true_after(delay_ms) {
    let ready = false
    setTimeout(() => ready = true, delay_ms)
    return () => ready
}
export function throttle(func, interval_ms = 200) {
    let isWaiting = false;
    let nextArgs:null|Array<any> = null;
    function handle(...args) {
        if (isWaiting) {
            nextArgs = args;
            return;
        }
        isWaiting = true;
        func(...args);

        setTimeout(() => {
            isWaiting = false;
            
            // If there's a queued call, execute it
            if (nextArgs !== null) {
                handle(...nextArgs);
                nextArgs = null
            }
            else {
            }
        }, interval_ms);
    };
    return handle
}
export function _D(name,data) {
    let [key] = name.match(/^(\w+)/)||[]
    let party = window.party_singleton
    if (!party || party.debugthe[key]) {
        if (data?.json && data.json.startsWith('{"type":"latency_p')) return
        console.log(name,data)
    }
}