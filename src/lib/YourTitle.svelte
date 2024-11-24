<script type="ts">
    let {
        // should update instantly sometimes, eg onload
        //  2s delay when not sure of intent and they may still be typing
        //  via 
        title=$bindable(),
        default_title="untitled",
        editable=true,
        negate,
    } = $props()
    if (!title) {
        title = default_title
    }
    // the field
    let yourtitle_el
    let loaded_title = false;
    // separate this from title reactivity
    let title_printable = $state(title)
    // resume the last title
    // and copy to printable if a change
    $effect(() => {
        if (title == default_title && !loaded_title) {
            // init
            loaded_title = true;
            if (localStorage.title) {
                title = localStorage.title;
            }
        } else {
            localStorage.title = title;
        }
        // check we aren't overwriting the source of this data
        if (yourtitle_el && yourtitle_el.textContent != title) {
            title_printable = title;
        }
    });
    function writingyourtitle(event) {
        // a noise filter
        console.log("writingyourtitle", event);
        if (event.key == "Enter") {
            console.log("Caught Enter, assume you wrote a title");
            // unfocus - so the android keyboard should retract?
            yourtitle_el.blur();
            commit_titlechange();
            event.preventDefault();
        }
    }

    // the title button|label blanks the title
    function letswriteatitle(event) {
        if (yourtitle_el) {
            yourtitle_el.textContent = ""
            yourtitle_el.focus()
        }
    }
    // as will it being the default, once
    let first_writingyourtitle = true
    function yourtitle_onfocus(event) {
        if (first_writingyourtitle) {
            first_writingyourtitle = false;
            // clear the default value
            if (title == default_title) {
                yourtitle_el.textContent = ""
            }
        }
    }

    // when typing, put title in slow_title for a while first
    // prevents the record changing title too quickly while typing
    //  while not requiring a onblur() event to set it
    let slow_title = $state()
    function changeyourtitle(event) {
        slow_title = event.target.textContent;
    }
    $effect(() => {
        if (slow_title != null && slow_title != title) {
            pend_titlechange()
        }
    })
    // a unique object
    let pending_titlechange = {}
    function pend_titlechange() {
        console.log("Pending began for "+slow_title)
        let thischange = pending_titlechange = {}
        setTimeout(() => {
            if (thischange == pending_titlechange) {
                commit_titlechange()
            }
        },2200)
    }
    function commit_titlechange() {
        pending_titlechange = {}
        if (title != slow_title) {
            title = slow_title
        }
    }
</script>

<h1 class="casual" >


<button class="casual"
        onclick={letswriteatitle}
    >Title</button>


    <span
        contenteditable={editable}
        bind:this={yourtitle_el}
        onfocus={yourtitle_onfocus}
        oninput={changeyourtitle}
        onkeypress={writingyourtitle}
        onblur={commit_titlechange}
        class="yourtitle"
        spellcheck="false"

        >{title_printable}</span>

</h1>