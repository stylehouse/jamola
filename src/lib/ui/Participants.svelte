<script lang="ts">
    import autoAnimate from "@formkit/auto-animate"
    import Rack from "./Rack.svelte";
    import Sharing from "./Sharing.svelte";

    let {party} = $props()
    function tog_ftp(par) {
        par.sharing ? par.sharing.stop()
            : par.start_sharing()
    }
</script>
<div class="participants" use:autoAnimate>
    {#each [...party.participants.values()] as par (par.peerId)}
        <div class="participant {par.local ? 'monitor' : ''}">
            <span class="always_visible_horizontally">
                <span class="parjunk">
                    <span class="theyname">{par.name || par.peerId}</span>
                    {#if par.local}<span class="streamtype">monitor</span>{/if}
                    {#if par.offline}<span class="error">offline</span>{/if}
                    {#if par.constate}<span class="techwhat">{par.constate}</span>{/if}
                </span>
                <span class="parjunk">
                    {#if !par.local}
                        <button onclick={() => tog_ftp(par)}>ftp</button>
                    {/if}
                    ANOTHER!
                </span>
            </span>
    
            {#if par.gain}
                <span class="rack">
                    <Rack {par} />
                </span>
            {/if}

            {#if par.sharing}
                <Sharing {par}></Sharing>
            {/if}
        </div>
    {/each}
    
</div>

<style>
    .participant {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: 0.5rem 0;
        padding: 0.5rem;
        background: #2b463b;
        border-radius: 4px;
    }
    .monitor {
        background-color: #25855d;
    }
    .theyname {
        font-weight: bold;
    }

    .streamtype {
        font-size: 0.8em;
        color: #666;
    }
    .always_visible_horizontally {
        display:inline-block;
        padding:0.5em;
    }
    .parjunk {
        display:block;
    }
</style>