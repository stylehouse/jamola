<script type="ts">
    let {
        userName=$bindable(),
        default_userName="you",
        editable=true,
        negate,
    } = $props()
    if (!userName) {
        userName = default_userName
    }
    // the field
    let yourname_el ;

    function changeyourname(event) {
        userName = event.target.textContent;
    }
    let first_writingyourname = true;
    function writingyourname(event) {
        // a noise filter
        console.log("writingyourname", event);
        if (event.key == "Enter") {
            console.log("Caught Enter, assume you want to Ring now");
            negate();
            // unfocus - so the android keyboard should retract?
            yourname_el.blur();
            // < since splitting from Call.svelte,
            //   this is also required to stop the Enter being entered
            editable = false
            //    whereas before just this would do it:
            event.preventDefault();
        } else {
            if (first_writingyourname) {
                first_writingyourname = false;
                if (userName == default_userName) {
                    userName_printable = "";
                }
            }
        }
    }
    // make a printable version that we will update less
    // svelte-ignore state_referenced_locally
    let userName_printable = $state(userName);
    let loaded_username = false;
    // resume the last username
    // and copy to printable if a change
    $effect(() => {
        if (userName == default_userName && !loaded_username) {
            // init
            loaded_username = true;
            if (localStorage.userName) {
                userName = localStorage.userName;
            }
        } else {
            localStorage.userName = userName;
        }
        // check we aren't overwriting the source of this data
        if (yourname_el && yourname_el.textContent != userName) {
            userName_printable = userName;
        }
    });
    // ensnare the user in paperwork on their first visit
    let focus_yourname_once = true;
    let focus_yourname_after_ms = 720
    $effect(() => {
        // have to put this after we may have loaded_username
        if (yourname_el && focus_yourname_once && userName == default_userName) {
            setTimeout(() => {
                yourname_el.textContent = ""
                yourname_el.focus();
            }, focus_yourname_after_ms);
            console.log("focus yourname");
        }
        focus_yourname_once = false;
    });
</script>

<span
    contenteditable={editable}
    bind:this={yourname_el}
    oninput={changeyourname}
    onkeypress={writingyourname}
    class="yourname">{userName_printable}</span
>

<style>

    .yourname {
        font-size: 170%;
        color: rgb(54, 19, 19);
        text-shadow: 5px 3px 9px #aca;
    }
</style>