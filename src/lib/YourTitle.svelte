<script lang="ts">
    import { onMount } from 'svelte';
    
    interface Props {
        title?: string;
        default_title?: string;
        editable?: boolean;
        onChange?: (newTitle: string) => void;
    }
    
    let {
        title: initialTitle = '',
        default_title = 'untitled',
        editable = true,
        onChange,
    } = $props();
    
    // State management
    let title = $state(initialTitle || default_title);
    let displayTitle = $state(title);
    let titleElement: HTMLElement;
    let isFirstFocus = true;
    let pendingTimeout: number | null = null;
    
    // Load saved title on mount
    onMount(() => {
        const savedTitle = localStorage.getItem('title');
        if (savedTitle && title === default_title) {
            updateTitle(savedTitle);
        }
    });
    
    // Watch for external title changes
    $effect(() => {
        if (initialTitle && initialTitle !== title) {
            updateTitle(initialTitle);
        }
    });
    
    function updateTitle(newTitle: string) {
        title = newTitle;
        displayTitle = newTitle;
        localStorage.setItem('title', newTitle);
        onChange?.(newTitle);
    }
    
    function handleTitleChange(event: InputEvent) {
        const newTitle = (event.target as HTMLElement).textContent?.trim() || '';
        
        // Clear any existing pending timeout
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
        }
    
        // Set new pending timeout
        pendingTimeout = setTimeout(() => {
            updateTitle(newTitle);
            pendingTimeout = null;
        }, 2000) as unknown as number;
    }
    
    function handleKeyPress(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault();
            titleElement?.blur();
            if (pendingTimeout) {
                clearTimeout(pendingTimeout);
                pendingTimeout = null;
            }
            updateTitle(titleElement.textContent?.trim() || '');
        }
    }
    
    function handleBlur() {
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
        }
        updateTitle(titleElement.textContent?.trim() || '');
    }
    
    function handleFocus() {
        if (isFirstFocus && title === default_title) {
            titleElement.textContent = '';
            isFirstFocus = false;
        }
    }
    
    function clearTitle() {
        if (titleElement) {
            titleElement.textContent = '';
            titleElement.focus();
        }
    }
</script>

<h1 class="casual">
    <button 
        class="casual"
        on:click={clearTitle}
    >
        Title
    </button>

    <span
        bind:this={titleElement}
        contenteditable={editable}
        class="yourtitle"
        spellcheck="false"
        on:input={handleTitleChange}
        on:keypress={handleKeyPress}
        on:focus={handleFocus}
        on:blur={handleBlur}
    >{displayTitle}</span>
</h1>