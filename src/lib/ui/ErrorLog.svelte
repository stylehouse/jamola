<script lang="ts">
    import { onDestroy } from 'svelte';
    import autoAnimate from "@formkit/auto-animate"
    import { SvelteSet } from 'svelte/reactivity';
    import { processErrorChain } from './Error';

    let { party } = $props();
    let hovered = new Map<Error, boolean>();
    let expandedStacks = $state(new SvelteSet());
    
    // Process error chains
    let processedErrors = $derived(party.recent_errors.map(error => processErrorChain(error)));

    let cleanupInterval: any;
    $effect(() => {
        cleanupInterval = setInterval(() => {
            const now = Date.now();
            party.recent_errors = party.recent_errors.filter(error => {
                return (now - error.now < 9000) || hovered.get(error)
                    || party.recent_errors.length == 1;
            });
        }, 1000);
    });
    
    onDestroy(() => {
        clearInterval(cleanupInterval);
        hovered.clear();
    });

    function formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
    
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
                stack: stack.join('\n')
            });
        });
    }
</script>

<div class="error-log" use:autoAnimate>
    {#each party.recent_errors as error, errorIndex}
        {@const processed = processedErrors[errorIndex]}
        <div
            class="error-item"
            class:global={error.via === 'global'}
            class:rejection={error.via === 'rejection'}
            class:console={error.via === 'console'}
            onmouseenter={() => hovered.set(error, true)}
            onmouseleave={() => hovered.set(error, false)}
        >
            <div class="error-time">{formatTime(error.now)}</div>
            <div class="error-chain">
                {#each processed.chain as {depth, message, rawError}, chainIndex}
                    <div class="error-line" style="padding-left: {depth}em">
                        <span 
                            class="error-text" 
                            class:has-stack={processed.compressedStacks[chainIndex].length > 0}
                            onclick={() => toggleStack(rawError)}
                        >{message}</span>
                        <button 
                            class="log-button" 
                            onclick={() => logError(rawError)}
                        >ℹ️</button>
                        {#if expandedStacks.has(rawError)}
                            <pre class="local-stack">
                                {processed.compressedStacks[chainIndex].join('\n')}
                            </pre>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/each}
</div>

<style>
    .error-log {
        position: fixed;
        bottom: 1rem;
        right: 1rem;
        max-width: 400px;
        max-height: 50vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column-reverse;
        gap: 0.5rem;
        z-index: 1000;
    }

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
        white-space: pre-wrap;
        font-family: monospace;
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