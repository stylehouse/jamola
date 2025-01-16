<script lang="ts">
    import { onDestroy } from 'svelte';
    import autoAnimate from "@formkit/auto-animate"

    let {party}:any = $props()
    
    // Clean up errors every second
    let cleanupInterval:any;
    $effect(() => {
        cleanupInterval = setInterval(() => {
            const now = Date.now();
            party.recent_errors = party.recent_errors.filter(error => {
                // Keep if either:
                // 1. Less than 9 seconds old
                // 2. Currently being hovered
                return (now - error.now < 9000) || error.hover
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
</script>

<div class="error-log" use:autoAnimate>
    {#each party.recent_errors as error}
        <div
            class="error-item"
            class:global={error.via === 'global'}
            class:rejection={error.via === 'rejection'}
            onmouseenter={() => error.hover = true}
            onmouseleave={() => error.hover = false}
        >
            <div class="error-time">{formatTime(error.now)}</div>
            <div class="error-msg">{error.msg}</div>
            <button onclick={() => console.log("ErrorLog's ",error)}>log</button>
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

    .error-item.global {
        border-left-color: #f55;
    }

    .error-item.rejection {
        border-left-color: #f95;
    }

    .error-time {
        font-size: 0.8rem;
        opacity: 0.8;
        margin-bottom: 0.2rem;
    }

    .error-location {
        font-size: 0.8rem;
        opacity: 0.7;
        margin-top: 0.2rem;
        font-family: monospace;
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