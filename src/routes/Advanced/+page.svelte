<script>

    import Advanced from "$lib/view/Advanced.svelte";
    let on = $state()
    $effect(() => {
        if (self.navigator) {
            on = 1
        }
    })
</script>


{#if on}<Advanced />
{:else}
Lobing...
{/if}


<style>
    :global(body) {
        background: rgba(40, 49, 45, 0.788);
        background-image: url("IMG_3524.jpeg")
    }
    :global(input) {
        background: rgba(208, 88, 255, 0.788);
        font-size: 2em;
    }
</style>