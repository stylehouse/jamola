<script lang="ts">
    let rem = $state([])
    function begin() {
        rem.push("Began")   
    }
</script>

<button on:click={begin}>Ring</button>
    <ul>
    {#each rem as remark}
        <li>{remark}</li>
    {/each}
    </ul>

<style>
    button {
        font-size: 13em;
    }
</style>