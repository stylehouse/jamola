<script lang="ts">
    import { onDestroy } from 'svelte';
    import autoAnimate from "@formkit/auto-animate"
    import Error from './Error.svelte';

    let { party } = $props();
    let hovered = new WeakMap<Error, boolean>();
    
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
        hovered = null
    });

</script>

<div class="error-log" use:autoAnimate>
    {#each party.recent_errors as error, errorIndex}
        <Error {error}
            onmouseenter={() => hovered.set(error, true)}
            onmouseleave={() => hovered.set(error, false)} ></Error>
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

</style>