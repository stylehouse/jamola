<script lang="ts">
    import { FileListing, Sharing } from '$lib/kolektiva/Sharing.svelte';
    import FileList from './FileList.svelte';
    
    let { par } = $props();
    let sharing:Sharing = par.sharing;

    // Convert transfer objects to FileListing-like objects
    let transfers = $derived(
        Array.from(sharing.tm?.transfers.values() ?? []).map(t => ({
            name: t.filename,
            size: t.size,
            modified: t.created_ts,
            progress: t.progress,
            status: t.status
        }))
    );

    // < higher level things to click on, eg tags
    // < modes of picking at huger collections:
    //    nab - all
    //    rummage - randomly
    //     should offer to heal the gaps left in the result
    function click_push(file: FileListing) {
        sharing.sendFile(file.name);
    }
    function click_pull(file: FileListing) {
        sharing.pull(file.name)
    }
    function huh() {
        // < do
        console.log('stuffs:', [sharing.localList,sharing.remoteList]);
    }
    // always have this in there...
    let compat_mode = $state()
    let compat_directory_input_element = $state()
    $effect(() => {
        if (!('showDirectoryPicker' in window)) {
            compat_mode = true
        }
    })
    $effect(async () => {
        if (compat_directory_input_element) {
            // < extra step|interaction here - not fast enough!
            //   maybe if we Participant.svelte tog_ftp()
            //    on pointerdown create this UI, pointerup hit sharing.start()
            //     probably just exposes a crack to fall into
            let hook = sharing.local_directory_compat
            if (!hook) throw "hook not ready"
            await hook(compat_directory_input_element)
        }
    })
    $inspect("wee compat element", compat_directory_input_element)
</script>

<div class="file-sharing">
    <div class="lists-container">
        <FileList 
            title="Local Files" 
            list={sharing.localList} 
            onFileClick={click_push}
            onRefreshClick={() => sharing.refresh_localList()} >
            {#snippet compat()}
                {#if compat_mode}
                    <h3>THE COMPAT MODE SPEECH</h3>
                    <p>You don't seem to allow Directory writing access.
                        Downloads will be batched in a .tar file to preserve directory structure, use
                        <a href="https://play.google.com/store/apps/details?id=com.rarlab.rar">
                            Android's RAR</a>
                        or 
                        <a href="https://apps.apple.com/us/app/izip-zip-unzip-unrar/id413971331">
                            Apple's iZip</a>
                        to extract it.
                    </p>
                    <span style="">
                        <input bind:this={compat_directory_input_element}
                            type=file webkitdirectory multiple />
                    </span>
                {/if}
            {/snippet}
        </FileList>
        {#if transfers.length > 0}
            <div class="transfers">
                <h3>Active Transfers</h3>
                {#each transfers as transfer}
                    <div class="transfer">
                        <span class="name">{transfer.name}</span>
                        <div class="progress-bar">
                            <div 
                                class="progress" 
                                style="width: {transfer.progress}%"
                            ></div>
                        </div>
                        <span class="status">{transfer.status}</span>
                        {#if transfers.errorMessage}
                            <span class="status">{transfer.errorMessage}</span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

        <FileList 
            title="Remote Files" 
            list={sharing.remoteList}
            onFileClick={click_pull}
            onRefreshClick={() => sharing.refresh_remoteList()}
        />
    </div>
</div>

<style>
    .file-sharing {
        width: 100%;
    }

    .lists-container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 1rem;
    }

    .transfers {
        grid-column: 1 / -1;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 0.5rem;
        background: rgba(0, 0, 0, 0.2);
    }

    .transfer {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem;
    }

    .progress-bar {
        flex: 1;
        height: 4px;
        background: #444;
        border-radius: 2px;
        overflow: hidden;
    }

    .progress {
        height: 100%;
        background: #4CAF50;
        transition: width 0.3s ease;
    }

    .status {
        font-size: 0.9em;
        color: #888;
    }

    h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #aaa;
    }
</style>