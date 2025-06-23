<script lang="ts">
    let {v} = $props()
    // em size to go through
    let big = 2.1
    let small = 1

    let says = $derived((
            v == undefined ? ''
            : v == Infinity ? '∞'
            : v == -Infinity ? '-∞'
            : v == '0.00' ? '0'
            : ''+v
        ).split(''))
    function eachletter(i) {
        let size = big - i * 0.3
        size = Math.max(size,small)
        let style = `font-size:${size}em;`
        return style
    }
</script>

{#each says as s,i (i)}
    <span style={eachletter(i)}>{s}</span>
{/each}
<style>
    span {
        background: #f932;
        border-radius:0.3em;
    }
</style>