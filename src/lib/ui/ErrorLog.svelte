<script lang="ts">
    import { onDestroy } from 'svelte';
    import autoAnimate from "@formkit/auto-animate"
    import { SvelteSet } from 'svelte/reactivity';

    let {party} = $props();
    let hovered = new Map<Error,boolean>();
    
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

    function* errorChain(error) {
        let current = error;
        let depth = 0;

        while (current) {
            let the = {
                depth,
                msg: current.local_msg || current.msg,
                stack: current.local_stack || current.stack,
                error: current
            };
            console.log(`error chain @${depth}`,the)
            yield the
            current = current.cause;
            depth++;
        }
    }

    let expandedStacks = $state(new SvelteSet());
    
    function toggleStack(error) {
        if (expandedStacks.has(error)) {
            expandedStacks.delete(error);
        } else {
            expandedStacks.add(error);
        }
    }
    
    function logError(error) {
        console.info('Error debug:', error);
    }
</script>

<div class="error-log" use:autoAnimate>
    {#each party.recent_errors as error}
        <div
            class="error-item"
            class:global={error.via === 'global'}
            class:rejection={error.via === 'rejection'}
            class:console={error.via === 'console'}
            on:mouseenter={() => hovered.set(error, true)}
            on:mouseleave={() => hovered.set(error, false)}
        >
            <div class="error-time">{formatTime(error.now)}</div>
            <div class="error-msg">
                {#each [...errorChain(error)] as {depth, msg, stack, error: err}}
                    <div class="error-line" style="padding-left: {depth * 1}em">
                        <span 
                            class="error-text" 
                            class:has-stack={stack}
                            on:click={() => stack && toggleStack(err)}
                        >{msg}</span>
                        <button 
                            class="log-button" 
                            on:click|stopPropagation={() => logError(err)}
                        >ℹ️</button>
                        {#if stack && expandedStacks.has(err)}
                            <pre class="local-stack">{stack}</pre>
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

    .error-text {
        cursor: default;
        display: block;
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

    .error-item.global { border-left-color: #f55; }
    .error-item.rejection { border-left-color: #f95; }
    .error-item.console { border-left-color: #f75; }

    .error-time {
        font-size: 0.8rem;
        opacity: 0.8;
        margin-bottom: 0.2rem;
    }

    @keyframes slide-in {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
</style>