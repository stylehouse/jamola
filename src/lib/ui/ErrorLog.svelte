<script lang="ts">
    import { onDestroy } from 'svelte';
    import autoAnimate from "@formkit/auto-animate"

    let {party} = $props();
    let hovered:Map<Error,boolean> = new Map()
    
    let cleanupInterval: any;
    $effect(() => {
        cleanupInterval = setInterval(() => {
            const now = Date.now();
            party.recent_errors = party.recent_errors.filter(error => {
                return (now - error.now < 9000) || hovered.get(error);
            });
        }, 1000);
    });
    
    onDestroy(() => {
        clearInterval(cleanupInterval);
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

    function formatStack(error) {
        let stack = '';
        let current = error;
        while (current) {
            if (current.stack) {
                stack += current.stack.split('\n').slice(1).join('\n');
            }
            current = current.cause;
            if (current) {
                stack += '\n\nCaused by:\n';
            }
        }
        return stack;
    }
</script>

<div class="error-log" use:autoAnimate>
    {#each party.recent_errors as error}
        <div
            class="error-item"
            class:global={error.via === 'global'}
            class:rejection={error.via === 'rejection'}
            class:console={error.via === 'console'}
            onmouseenter={() => hovered.set(error, true)}
            onmouseleave={() => hovered.set(error, false)}
        >
            <div class="error-time">{formatTime(error.now)}</div>
            <div class="error-msg" style="white-space: pre-wrap">{error.msg}</div>
            {#if error.stack || (error.error && error.error.stack)}
                <details class="error-details">
                    <summary>Stack trace</summary>
                    <pre class="error-stack">{formatStack(error.error || error)}</pre>
                </details>
            {/if}
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

    .error-item.global { border-left-color: #f55; }
    .error-item.rejection { border-left-color: #f95; }
    .error-item.console { border-left-color: #f75; }

    .error-time {
        font-size: 0.8rem;
        opacity: 0.8;
        margin-bottom: 0.2rem;
    }

    .error-details {
        margin-top: 0.5rem;
        font-size: 0.8rem;
    }

    .error-details summary {
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
    }

    .error-details summary:hover {
        opacity: 1;
    }

    .error-stack {
        margin: 0.5rem 0;
        padding: 0.5rem;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 2px;
        white-space: pre-wrap;
        font-family: monospace;
        font-size: 0.8rem;
        overflow-x: auto;
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

    /* Scrollbar styling */
    .error-log::-webkit-scrollbar {
        width: 6px;
    }

    .error-log::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
    }

    .error-log::-webkit-scrollbar-thumb {
        background: rgba(255, 85, 85, 0.5);
        border-radius: 3px;
    }
</style>