<script lang="ts">
    import Partool from "./Partool.svelte";
import Rack from "./Rack.svelte";
    import Sharing from "./Sharing.svelte";
    
    let { par } = $props();
    
    async function tog_ftp() {
        // if you await start_sharing() you get "must be handling user gesture" errors
        par.sharing ? par.stop_sharing() : par.start_sharing()
    }

    async function accept_sharing() {
        par.start_sharing()
    }
</script>

<div class="participant {par.local ? 'monitor' : ''}">
    <div class="participant-content">
        <div class="always_visible_horizontally">
            <div class="parjunk">
                <span class="theyname">{par.name || par.peerId}</span>
                {#if par.local}<span class="streamtype">monitor</span>{/if}
                {#if par.offline}<span class="error">offline</span>{/if}
                {#if par.constate}<span class="techwhat">{par.constate}</span>{/if}
            </div>
            <div class="parjunk">
                {#if !par.local}
                    {#if par.sharing_requested}
                        <div class="sharing-request">
                            <span>...asked to share files</span>
                            <button onclick={accept_sharing}>Accept</button>
                        </div>
                    {:else}
                        <label class="ftp-toggle">
                            <input 
                                type="checkbox" 
                                checked={!!par.sharing}
                                onchange={() => tog_ftp()}
                            />
                            <span class="ftp-label">ftp</span>
                        </label>
                    {/if}
                {/if}
            </div>
        </div>

        {#if par.gain}
            <div class="rack">
                <Partool {par} />
                <Rack {par} />
            </div>
        {/if}
    </div>

    {#if par.sharing}
        <div class="sharing-container">
            <Sharing {par}></Sharing>
        </div>
    {/if}
</div>

<style>
    .participant {
        display: flex;
        flex-direction: column;
        background: #2b463b;
        border-radius: 4px;
        overflow: hidden;
        z-index:11;
    }

    .participant-content {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem;
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
        display: inline-block;
        padding: 0.5em;
    }

    .parjunk {
        display: block;
        margin-bottom: 0.25rem;
    }

    .ftp-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
    }

    .ftp-label {
        user-select: none;
    }

    .sharing-container {
        width: 100%;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1rem;
    }

    .error {
        color: #ff4444;
    }

    .techwhat {
        font-size: 0.8em;
        color: #888;
    }

    .sharing-request {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.25rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }

    .sharing-request button {
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        border: none;
        background: #4CAF50;
        color: white;
        cursor: pointer;
    }

    .sharing-request button:hover {
        background: #45a049;
    }
</style>