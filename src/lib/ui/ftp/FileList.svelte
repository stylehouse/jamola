<script lang="ts">
    import type { FileListing } from "$lib/kolektiva/Sharing.svelte";
    import type { Snippet } from "svelte";

    type args = {
        list: DirectoryListing,
        title: string,
        onFileClick: (file: FileListing) => void,
        onRefreshClick: () => void,
        compat?: Snippet
    }
    let { list,title,onFileClick,onRefreshClick,compat }:args = $props();
    let {files,directories} = $derived(list || {})
    onRefreshClick ||= () => {}
    onFileClick ||= () => {}
</script>

<div class="file-list">
    <h3 class="title">
        {title} 
        <span role=button onclick={onRefreshClick}>⟳</span>
    </h3>

    {@render compat?.()}

    {#if !list}
        list awaits...
    {:else}
        {#if directories?.length}
            <div class="items">
                {#each directories as dir (dir.name)}
                    <div class="item dir" onclick={() => onFileClick(dir)}>
                        <span class="name">
                            {dir.name}
                            <span class=slash>/</span>
                        </span>
                        <span class="meta">
                            <span class="remember">...</span>
                        </span>
                    </div>
                {/each}
            </div>
        {/if}

        {#if !files?.length}
            <div class="empty">No files</div>
        {:else}
            <div class="items">
                {#each files as file (file.name)}
                    <div class="item file" onclick={() => onFileClick(file)}>
                        <span class="name">{file.name}</span>
                        <span class="meta">
                            <span class="size">{file.formattedSize}</span>
                            <span class="date">{file.formattedDate}</span>
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
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

    .items {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .item {
        display: flex;
        justify-content: space-between;
        padding: 0.25rem 0.5rem;
        border-radius: 2px;
        cursor: pointer;
    }
    .file {
    }
    .dir {
        font-weight:400;
    }
    .dir .slash {
        color:whitesmoke;
    }

    .item:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .meta {
        display: flex;
        gap: 1rem;
        color: #888;
        font-size: 0.9em;
    }
</style>