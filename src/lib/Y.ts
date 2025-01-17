
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




// add an enclosing context onto an error
//  used by catch(err) {...} everywhere
// you should throw them as it doesn't collect them.
export function erring(label: string, err?: Error | string): Error {
    if (!err) {
        // same as just: throw "the label"
        return new Error(label)
    }
    // Create base error from string if needed
    if (typeof err === 'string') {
        err = new Error(err);
    }

    // Build indented label stack
    const indent = ' '.repeat(2);
    let fullMessage = label;
    let currentErr = err;
    let depth = 1;
    while (currentErr) {
        fullMessage += '\n' + indent.repeat(depth)
            + (currentErr.local_msg || currentErr.msg);
        currentErr = currentErr.cause;
        depth++;
    }
    // Create new error with the original as its cause
    const wrappedError = new Error(fullMessage, { cause: err });
    wrappedError.msg = fullMessage;
    wrappedError.local_msg = label
    
    // V8-specific stack cleanup
    //  makes it go from the caller's perspective
    // < otherwise you get a stack full of "erring()" ?
    //    we should massage the stack in ErrorLog.svelte
    if (0 && Error.captureStackTrace) {
        Error.captureStackTrace(wrappedError, erring);
    }
    
    return wrappedError;
}
