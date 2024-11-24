<script lang="ts">
</script>

<slot />

<style>
    @font-face {
        font-family: "RipeApricots";
        src: url("/RipeApricots.ttf") format("truetype");
        font-weight: normal;
        font-style: normal;
    }
    :global(h1, button, select) {
        font-family: "RipeApricots", sans-serif;
        background: #4024;
        font-size: 2em;
        padding: 9px;
        vertical-align: middle;
    }
    :global(div, h1, button, select, yourname) {
        border-radius: 1em;
    }
    :global(h1) {
        font-size: 330%;
    }
    :global(span[contenteditable="true"]) {
        border-bottom: 7px dashed #84d;
    }
    :global(.overhang) {
        position: absolute;
        pointer-events: none;
    }
    :global(.controls) {
        display: flex;
        gap: 1rem;
        margin: 2rem 0;
    }
    :global(button) {
        padding: 0.3rem 1rem;
        cursor: pointer;
        font-size: 8em;
        line-height: 0.3em;
    }
    :global(.casual) {
        line-height: 0.3em;
        margin: 0em;
    }
    :global(.casual button) {
        background-color: rgba(97, 88, 60, 0.322);
        font-size: 1.2em;
    }
    :global(button:disabled) {
        opacity: 0.5;
        cursor: not-allowed;
    }
    :global(.status) {
        color: rgb(17, 11, 75);
        font-family: monospace;
    }
    :global(.error) {
        color: red;
        font-family: monospace;
    }
    :global(.ohno) {
        color: red;
        font: monospace;
    }
    :global(.techwhat) {
        color: cyan;
        font: monospace;
    }
    :global(.bitrate) {
        color: rgb(0, 183, 255);
        font-family: monospace;
        transform: scaleY(0.7);
        filter: blur(1px);
    }
    :global(input[type="range"]::-webkit-slider-runnable-track) {
        width: 100%;
        height: 18px;
        background: #ddd;
        border-radius: 4px;
    }
    :global(input[type="range"]::-moz-range-track) {
        width: 100%;
        height: 8px;
        background: #ddd;
        border-radius: 4px;
    }
    :global(input[type="range"]::-ms-track) {
        width: 100%;
        height: 18px;
        background: transparent;
        border-color: transparent;
        color: transparent;
    }
</style>
