<script lang="ts">
    import { FileListing } from '$lib/kolektiva/Sharing.svelte';
    import FileList from './FileList.svelte';
    
    let { par } = $props();
    let sharing = par.sharing;

    // Convert raw file data to FileListing instances
    let localFiles = $derived(
        sharing.list?.files.map(f => new FileListing(f)) ?? []
    );

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

    let remoteFiles: FileListing[] = []; // Will be populated when implemented

    function startTransfer(file: FileListing) {
        sharing.sendFile(file.name);
    }

    function requestFile(file: FileListing) {
        // To be implemented when remote files are available
        console.log('Request file:', file.name);
    }
</script>

<div class="file-sharing">
    <div class="lists-container">
        <FileList 
            title="Local Files" 
            files={localFiles} 
            onFileClick={startTransfer}
        />
        
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
                    </div>
                {/each}
            </div>
        {/if}

        <FileList 
            title="Remote Files" 
            files={remoteFiles}
            onFileClick={requestFile}
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