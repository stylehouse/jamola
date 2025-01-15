<script lang="ts">
    import autoAnimate from "@formkit/auto-animate"
    import Participant from "./Participant.svelte";

    let {party} = $props()
</script>

<div class="participants" use:autoAnimate>
    {#each [...party.participants.values()] as par (par.peerId)}
        <Participant {par} />
    {/each}
</div>

<style>
    .participants {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
</style>