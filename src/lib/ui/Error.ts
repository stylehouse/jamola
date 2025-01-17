// Types for processed error information
interface ProcessedError {
    depth: number;
    message: string;
    stack: string[];
    rawError: Error;
}

interface ProcessedErrorChain {
    chain: ProcessedError[];
    compressedStacks: string[][];
}

function processErrorChain(errorEvent: any): ProcessedErrorChain {
    const chain: ProcessedError[] = [];
    let current = errorEvent.error || errorEvent;
    let depth = 0;

    // Build the chain of errors with their stacks
    while (current) {
        const stackLines = (current.stack || '').split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.includes('at erring'));
        
        // Separate error message line and stack frames
        const messageLine = stackLines.find(line => line.startsWith('Error:'));
        const stackFrames = stackLines.filter(line => !line.startsWith('Error:'));

        // Build processed stack with message at top and reversed stack frames
        const processedStack = [
            // Keep original message if present, otherwise use local_msg
            messageLine ? `!${messageLine}` : (current.local_msg ? `!${current.local_msg}` : undefined),
            // Reverse the actual stack frames
            ...stackFrames.reverse()
        ].filter(Boolean); // Remove undefined entries

        chain.push({
            depth,
            // Add ! prefix for all but the top-level message
            message: depth === 0 ? 
                (current.local_msg || current.msg || "Unknown error") :
                `!${current.local_msg || current.msg || "Unknown error"}`,
            stack: processedStack,
            rawError: current
        });
        
        current = current.cause;
        depth++;
    }

    // Process stacks to remove duplicates, working backwards
    const compressedStacks: string[][] = [];
    for (let i = chain.length - 1; i >= 0; i--) {
        const currentStack = chain[i].stack;
        
        if (i === chain.length - 1) {
            // For the deepest error, include full stack
            compressedStacks.unshift(currentStack);
            continue;
        }

        // Compare with previous error's stack to find unique frames
        const prevStack = chain[i + 1].stack;
        const uniqueFrames = currentStack.filter(frame => 
            !prevStack.includes(frame) && !frame.startsWith('!')
        );

        compressedStacks.unshift(uniqueFrames);
    }

    return { chain, compressedStacks };
}

export { processErrorChain, type ProcessedErrorChain, type ProcessedError };