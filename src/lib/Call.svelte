<script lang="ts">
    let rem = $state([])
    function begin() {
        console.log("Began!")
        rem.push("Began")   
    }
    $effect(() => {
        console.log("Effecting!")

    })
</script>

<button onclick={begin}>Ring</button>
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