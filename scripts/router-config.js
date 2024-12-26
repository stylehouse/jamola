import puppeteer from 'puppeteer';
import { writeFile } from 'fs/promises';
import { join } from 'path';

// CAVEATS:
// - these env are not connected
let debug_mode = 0
const config = {
    routerUrl: process.env.ROUTER_URL || 'http://192.168.1.1',
    username: process.env.ROUTER_USERNAME,
    password: process.env.ROUTER_PASSWORD,
    portMapping: {
      name: 's',
      externalPort: '443',
      internalPort: '9443',
      protocol: 'TCP'
    },

    checkInterval: parseInt(process.env.CHECK_INTERVAL, 10) || 600000, // 10 minutes

    headless: process.env.PUPPETEER_HEADLESS !== 'false',

    internalHosts: [
        'd0:50:99:0b:9d:30', // wired, usually works
        'c4:73:1e:c7:aa:65', 
    ],
};

function texts(els) {
    return els.forEach(div => div.textContent.trim())
}
// on adding a mapping to a host, we must find the identifier of our application
// will be something like:
//  'InternetGatewayDevice.Services.X_Application.32.'
let portmapapp_name = null
// we will add it if not found here
async function select_portforwarding_app(page) {
    let {appid_to_name} = await page.evaluate(() => {
        const select = document.querySelector(
            'select#portmapping_app_id_ctrl'
        );
        const options = Array.from(select.options);
        let appid_to_name = {}
        options.map(opt => {
            let name = opt.textContent.trim()
            appid_to_name[opt.value] = name
        })
        return {appid_to_name}
    })
    let appid = null
    // look for the one we want
    Object.entries(appid_to_name).forEach(([value, name]) => {
        if (name === config.portMapping.name) {
            appid = value
        }
    })
    debug_mode && console.log("Found apps:",appid_to_name)
    portmapapp_name = appid
    return appid
}

// which one!?
async function select_internal_host(page) {
    // get all the macs
    let {mac_to_hostname} = await page.evaluate(() => {
        const select = document.querySelector(
            'select#nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl'
        );
        const options = Array.from(select.options);
        let mac_to_hostname = {}
        options.forEach(opt => {
            let mac = opt.value.toLowerCase()
            let name = opt.textContent.trim()
            mac_to_hostname[mac] = name
        })
        return {mac_to_hostname}
    })
    debug_mode && console.log("Found internal hosts:",mac_to_hostname)

    // select the top priority one
    let mac = config.internalHosts
        .filter(mac => mac_to_hostname[mac]) [0]
    if (!mac) {
        console.error("only hosts:",mac_to_hostname)
        throw "can't find internal host"
    }
    else {
        console.log(`found internal host ${mac} = ${mac_to_hostname[mac]}`)
    }
    return mac.toUpperCase()
}
async function trySelector(fn,message = "...this is probably fine: ") {
    try {
        await fn();
    } catch (error) {
        if (error.name === 'TimeoutError') {
            console.log(message, error.message);
            return false;
        }
        throw error;
    }
    return true;
}


async function checkRouterConfig() {
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: '/usr/bin/chromium',
        args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
        ]
    });
    const page = await browser.newPage();
    const timeout = 5000;
    page.setDefaultTimeout(timeout);
    

    {
        const targetPage = page;
        await targetPage.setViewport({
            width: 898,
            height: 843
        })
        console.log('Navigating to router...');
        await page.goto('http://192.168.1.1/');

        // comes filled in
        // await page.type('#index_username', '!!Huawei');
        await page.type('#password', '@HuaweiHgw');
        await page.click('#loginbtn');
    


        await page.screenshot({ path: '/app/logs/step1.png' });

        
        // Handle popup if it appears
        console.log('Logging in...');
        await trySelector(async () => {
            await page.waitForSelector('#confirm_window', { timeout: 5000 });
            await page.click('#confirm_window');
        }, 'No confirmation popup found')




        // Navigate to forwarding settings
        console.log('Navigating to port forwarding...');
        await page.waitForSelector('#internet_settings_menu > div');
        await page.screenshot({ path: '/app/logs/step2.png' });
        await page.click('#internet_settings_menu > div');

        // Forwarding
        await page.waitForSelector('li:nth-of-type(9) font');
        await page.screenshot({ path: '/app/logs/step3.png' });
        await page.click('li:nth-of-type(9) font');
    }
    let casually = async () => {
        await Promise.all([
            page.waitForNetworkIdle({ idleTime: 50 }),
            new Promise(resolve => setTimeout(resolve,900))
        ]);
    }

    let mapping_exists = async () => {
        // Check if mapping exists
        let big = 'div#nat_pm_view_data_list > '
            +'div[id^=nat_pm_view_data_list_InternetGatewayDevice_Services_X_Portmapping] '
            +'div[id$="_data"] div div'
        let some = await trySelector(async () => {
            await page.waitForSelector(big);
        })
        await page.screenshot({ path: '/app/logs/step4.png' });
        // if there are some portmappings on the page, look at em
        if (some) {
            const existingMappings = await page.$$eval(
                big,
                els => els.map(el => el.textContent.trim())
            );
        
            if (existingMappings.includes('s')) {
              return true
            }
        }
    }
    console.log('Checking existing mappings...');
    if (await mapping_exists()) {
        console.log('Port forward already exists');
        return
    }


    // Add new mapping
    console.log('Adding new port mapping...');
    await page.click('a#nat_pm_view_data_add_link'); // New port mapping
    await page.waitForSelector('#nat_pm_view_data_list_multiedit_portmapping_Name_ctrl');
    await page.type('#nat_pm_view_data_list_multiedit_portmapping_Name_ctrl', 's');

    await page.screenshot({ path: '/app/logs/step5000.png' });

    
    {
        // another list that sometimes already has what we want in it
        //  even if the last one didn't
        
        console.log("Yeppers")
        await page.waitForSelector('select#portmapping_app_id_ctrl');
        
        let scroll_down = async () => {
            await page.evaluate(() => {
                const element = document.querySelector('div#portmapping_application_id div.modal-body');
                element.scrollTop = element.scrollHeight; 
            });
        }
        
        let appid = await select_portforwarding_app(page)
        console.log("select_portforwarding_app() = "+appid)
        if (appid != null) {
            console.log("found our portforwarding app: "+portmapapp_name)
        }
        else {
            // Add new application
            console.log("Adding portforwarding app")
            await page.screenshot({ path: '/app/logs/step5100.png' });
            await page.click('a#add_portmapping_app'); // Add port mapping application
            await page.screenshot({ path: '/app/logs/step5120-opening_applist.png' });
            // this just pulls up a list of them, click again to add one:
            await casually()
            await page.screenshot({ path: '/app/logs/step5121-populated_applist.png' });
            await page.waitForSelector('div#portmapping_application_id div.modal-body');
            await page.screenshot({ path: '/app/logs/step5122-same.png' });

            // scroll this all the way down

            //  the frontend seems to be lazy loading this list and the add button at the bottom of it!?
            scroll_down()
            await page.screenshot({ path: '/app/logs/step5131-scrolled-down.png' });
            
            // that takes ages
            await casually()
            await page.screenshot({ path: '/app/logs/step5132-same.png' });
            await page.click('a#portmapping_application_id_add_add_link'); // Add port application


            // that takes ages
            await casually()
            scroll_down()
            await page.screenshot({ path: '/app/logs/step5133-form-created.png' });
            // fields to fill in appear slowly:
            let some = await trySelector(async () => {
                await page.waitForSelector('input#portmapping_application_id_add_edit_application_Name_ctrl');
            }, "Waiting for the add app form...")
            await page.screenshot({ path: '/app/logs/step5134-same.png' });

            await page.type('#portmapping_application_id_add_edit_application_Name_ctrl', config.portMapping.name);
            
            // Configure ports
            // these start with goddamn zeroes that stay there
            let prej = 'div#portmapping_application_id_add_edit div#application_'
            let portMappings = [
                [prej+'externalPort div input[data-bind="start"]', config.portMapping.externalPort],
                [prej+'externalPort div input[data-bind="end"]', config.portMapping.externalPort],
                [prej+'internalPort div input[data-bind="start"]', config.portMapping.internalPort],
                // [prej+'internalPort div input[data-bind="end"]', config.portMapping.internalPort],
            ]

            // remove mystery thingies? don't seem to advantage us.
            await page.evaluate(() => {
                document.querySelectorAll('div#portmapping_application_id_add_edit > script')
                    .forEach((el) => {
                        // el.remove()
                    })
            });
                        
            // Clear and fill each input
            for (const [selector, value] of portMappings) {
                await page.evaluate((sel) => {
                    document.querySelectorAll(sel).forEach(el => {
                        el.value = '';
                        // Trigger any validation events
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                }, selector);
                
                // Click and type with a small delay between each character
                await page.click(selector);
                await page.keyboard.type(value, { delay: 50 });
            }

            // Final validation events
            await page.evaluate((mappings) => {
                mappings.forEach(([selector]) => {
                    document.querySelectorAll(selector).forEach(el => {
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                });
            }, portMappings);
            
            await page.screenshot({ path: '/app/logs/step5200-ports-filled.png' });
            await casually()
            await page.screenshot({ path: '/app/logs/step5202-same.png' });
            
            // Save application
            await page.click('button#portmapping_application_id_add_edit_submitctrl');
            await casually()
            
            scroll_down()
            await page.screenshot({ path: '/app/logs/step5300-validation-or-not.png' });
            await page.click('#portmapping_application_idclose_link_id'); // Close dialog
            await page.screenshot({ path: '/app/logs/step5301.png' });
            

            console.log("Added portforwarding app")
            // now refresh, see it in the <select> menu
            // < we'd need to click "New port mapping" etc if so...
            // await page.reload();
            // hopefully this wait will get us the new <select>:

            await casually()
            await page.screenshot({ path: '/app/logs/step5307.png' });

            let appid = await select_portforwarding_app(page)
            await page.screenshot({ path: '/app/logs/step5400.png' });
            if (appid == null) {
                throw "!found our portforwarding app after create"
            }
        }
    }


















    
    // select that application + host
    await page.select('select#portmapping_app_id_ctrl',portmapapp_name)
    await page.screenshot({ path: '/app/logs/step6000-app.png' });

    let mac = await select_internal_host(page);

    await page.select('select#nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl',mac)
    await page.screenshot({ path: '/app/logs/step7000-host.png' });
    await page.click('button#nat_pm_view_data_list_multiedit_submitctrl');

    // Wait for network idle and a small timeout
    await casually()

    await page.screenshot({ path: '/app/logs/step8000-submit.png' });

    await casually()

    await page.screenshot({ path: '/app/logs/step9000.png' });
    // Wait for network idle and a small timeout
    await casually()
    await page.screenshot({ path: '/app/logs/step9100.png' });
    if (!await mapping_exists()) {
        throw "failed? dont see the mapping"
    }


    console.log("Done.")
    await browser.close();

}
function main() {
    try {
        checkRouterConfig()
    } catch (err) {
        // < it would do this anyway right?
        console.error(err);
        process.exit(1);
    }
}

main()

setInterval(checkRouterConfig, config.checkInterval);
