// Types for processed error information
interface ProcessedError {
    depth: number;
    message: string;
    stack: string[];
    local_stack: string[];
    rawError: Error;
}

interface ProcessedErrorChain {
    chain: ProcessedError[];
}

function processErrorChain(errorEvent: any): ProcessedErrorChain {
    const chain: ProcessedError[] = [];
    let current = errorEvent.reason || errorEvent.error || errorEvent;
    let depth = 0;

    // Build the chain of errors with their stacks
    while (current) {
        // stack has the message and then the stack, split them
        let N = (current.stack || '').split('\n')
        // reversed (highest call first), stack only
        let stack = []
        let multi_message = []
        while (N.length) {
            let n = N.pop()
            let l = n.replace(/^\s*/,'')
            if (l != null && n.startsWith("    at ")) {
                stack.push(l)
            }
            else {
                multi_message.push(...N,n)
                break
            }
        }

        stack = stack.filter(n=>n)
        let last = stack.slice(-1)[0]
        if (last && last.startsWith('at erring ')) {
            stack.pop();
        }
        let message = current.local_msg || current.msg
            || current.message || current

        let cha = {
            depth,
            message,
            stack,
            local_stack: null, // in a moment
            rawError: current
        }
        chain.push(cha)
        
        current = current.cause;
        depth++;
    }

    // Process stacks to remove duplicates, working backwards
    for (let [i, cha] of chain.entries()) {
        let cha = chain[i]
        
        // shallowest error shall have the calls above it
        //  usually from an event handler to a high level action function
        if (i === 0) {
            continue;
        }

        // Compare with previous error's stack to find unique frames
        const prevStack = chain[i-1].stack;
        let si = -1
        while (1) {
            si++
            if (si > 100) throw "infloop"
            if (prevStack[si] == null) {
                if (cha.stack[si] != null) throw "prevstack should be shorter"
                if (!prevStack?.length && !cha.stack?.length) {
                    return
                }
                debugger
                // throw "should never get here"
            }


            if (prevStack[si] == cha.stack[si]
                && prevStack[si+1] != null
            ) {
                continue
            }
            // non-match from here
            cha.local_stack = cha.stack.slice(si)
            break
        }
        if (!cha.local_stack) {
            // debugger
        }
    }

    return { chain };
}

export { processErrorChain, type ProcessedErrorChain, type ProcessedError };