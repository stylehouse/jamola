<script lang="ts">
    import { SvelteSet } from 'svelte/reactivity';
    import autoAnimate from "@formkit/auto-animate"
    import { processErrorChain } from './Error';

    let { error, party } = $props();
    // expand to 
    let processed = $derived(processErrorChain(error))
    let expandedStacks = $state(new SvelteSet());



    function formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
    // this is a sub-error, along the chain
    function toggleStack(error: Error) {
        if (expandedStacks.has(error)) {
            expandedStacks.delete(error);
        } else {
            expandedStacks.add(error);
        }
    }
    
    function logError(error: Error) {
        console.info('Error chain:');
        const { chain } = processErrorChain(error);
        chain.forEach(({ depth, message, stack }) => {
            console.info('  '.repeat(depth) + 'Level', depth + ':', {
                message,
                stack: stack.join('\n'),
                error,
            });
        });
    }

    $effect(() => {
        if (party?.socket && error) {
            let message = processed.chain.map(({message,local_stack,stack}) => {
                return "\n"+message+"\n\n"+(local_stack || stack)+"\n"
            })
            // Construct the data object to send to the server
            const errorData = {
                message,
                // Include any other relevant properties from your 'error' object
                // that you want to log on the server.
                // For example, if your 'error' object has a 'via' property:
                via: error.via,
                now: error.now,
                username: party.userName,
            };

            party.socket.emit("error", errorData, (response: { status: string; message: string; }) => {
                if (response.status === 'success') {
                    console.log('Error successfully sent to server for logging.');
                } else {
                    console.error('Failed to send error to server:', response.message);
                }
            });
        }
    })

</script>



<div
class="error-item"
class:global={error.via === 'global'}
class:rejection={error.via === 'rejection'}
class:console={error.via === 'console'}
>
<div class="error-time">{formatTime(error.now)}</div>
<div class="error-chain" use:autoAnimate>
    {#each processed.chain as {depth, message, stack, local_stack, rawError}, chainIndex}
        {@const tostack = local_stack || stack}
        <div class="error-line" style="padding-left: {depth}em" use:autoAnimate>
            {#if 1 || expandedStacks.has(rawError)}
                <pre class="local-stack">{tostack.join('\n')}</pre>
            {/if}
            <span 
                class="error-text" 
                class:has-stack={tostack.length > 0}
                onclick={() => toggleStack(rawError)}
            >{message}</span>
            <button 
                class="log-button" 
                onclick={() => logError(rawError)}
            >ℹ️</button>
        </div>
    {/each}
</div>
</div>



<style>

.error-item {
        background: rgba(30, 0, 0, 0.95);
        color: #faa;
        padding: 0.5rem;
        border-radius: 4px;
        font-size: 0.9rem;
        animation: slide-in 0.3s ease-out;
        border-left: 3px solid #f55;
    }

    .error-chain {
        white-space: pre-wrap;
    }

    .error-text {
        cursor: default;
    }

    .error-text.has-stack {
        cursor: pointer;
        border-bottom: 1px dotted rgba(255,255,255,0.2);
    }

    .error-text.has-stack:hover {
        border-bottom-color: rgba(255,255,255,0.5);
    }

    .local-stack {
        margin: 0.3em 0 0.3em 1em;
        padding: 0.3em;
        font-size: 0.85em;
        background: rgba(100, 0, 0, 0.3);
        border-radius: 2px;
        white-space: pre;
        font-family: monospace;
        display: block;
        overflow-x: auto;
    }

    .log-button {
        opacity: 0.5;
        background: none;
        border: none;
        padding: 0 0.2em;
        cursor: pointer;
        font-size: 0.8em;
        vertical-align: top;
    }

    .log-button:hover {
        opacity: 1;
    }
</style>