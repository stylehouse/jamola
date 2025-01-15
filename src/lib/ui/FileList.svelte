<script lang="ts">
    import type { FileListing } from "$lib/kolektiva/Sharing.svelte";

    
    export let files: FileListing[] = [];
    export let title: string;
    export let onFileClick: (file: FileListing) => void = () => {};
</script>

<div class="file-list">
    <h3 class="title">{title}</h3>
    {#if files.length === 0}
        <div class="empty">No files</div>
    {:else}
        <div class="files">
            {#each files as file}
                <div class="file" on:click={() => onFileClick(file)}>
                    <span class="name">{file.name}</span>
                    <span class="meta">
                        <span class="size">{file.formattedSize}</span>
                        <span class="date">{file.formattedDate}</span>
                    </span>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .file-list {
        border: 1px solid #444;
        border-radius: 4px;
        padding: 0.5rem;
        background: rgba(0, 0, 0, 0.2);
    }

    .title {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #aaa;
    }

    .empty {
        color: #666;
        font-style: italic;
        padding: 0.5rem;
        text-align: center;
    }

    .files {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .file {
        display: flex;
        justify-content: space-between;
        padding: 0.25rem 0.5rem;
        border-radius: 2px;
        cursor: pointer;
    }

    .file:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .meta {
        display: flex;
        gap: 1rem;
        color: #888;
        font-size: 0.9em;
    }
</style>