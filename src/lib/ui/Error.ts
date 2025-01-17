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
        const stack = (current.stack || '').split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.includes('at erring'));

        // Mark error message lines with '!'
        const processedStack = stack.map(line => 
            line.startsWith('Error:') ? `!${line.slice(1)}` : line
        );

        chain.push({
            depth,
            message: current.local_msg || current.msg || "Unknown error",
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