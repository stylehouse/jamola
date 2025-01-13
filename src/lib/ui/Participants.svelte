<script lang="ts">
    import Rack from "./Rack.svelte";
    
    let {party} = $props()
</script>
<div class="participants">
    {#each [...party.participants.values()] as par (par.peerId)}
        <div class="participant {par.local ? 'monitor' : ''}">
            <span class="always_visible_horizontally">
                <span class="theyname">{par.name || par.peerId}</span>
                {#if par.local}<span class="streamtype">monitor</span>{/if}
                {#if par.offline}<span class="error">offline</span>{/if}
                {#if par.constate}<span class="techwhat">{par.constate}</span>{/if}
            </span>
    
            {#if par.gain}
                <span class="rack">
                    <Rack {par} />
                </span>
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
        
    }
</style>