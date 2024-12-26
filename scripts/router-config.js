import puppeteer from 'puppeteer';
import { writeFile } from 'fs/promises';
import { join } from 'path';

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
    // console.log("Found apps:",appid_to_name)
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
    // console.log("Found internal hosts:",mac_to_hostname)

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
    // < here we should look at the port mappings and abort if exists?
    // 

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

    await page.screenshot({ path: '/app/logs/step5.png' });

    
    {
        // another list that sometimes already has what we want in it
        //  even if the last one didn't
        
        console.log("Yeppers")
        await page.waitForSelector('select#portmapping_app_id_ctrl');
        
        let appid = await select_portforwarding_app(page)
        console.log("select_portforwarding_app() = "+appid)
        if (appid != null) {
            console.log("found our portforwarding app: "+portmapapp_name)
        }
        else {
            // Add new application
            console.log("Adding portforwarding app")
            await page.screenshot({ path: '/app/logs/step51.png' });
            await page.click('a#add_portmapping_app'); // Add port mapping application
            await page.screenshot({ path: '/app/logs/step512-opening_applist.png' });
            // this just pulls up a list of them, click again to add one:
            await Promise.all([
                page.waitForNetworkIdle({ idleTime: 50 }),
                new Promise(resolve => setTimeout(resolve,900))
            ]);
            await page.waitForSelector('div#portmapping_application_id div.modal-body');
            await page.screenshot({ path: '/app/logs/step5121-populated_applist.png' });

            // scroll this all the way down
            //  the frontend seems to be lazy loading this list and the add button at the bottom of it!?
            await page.evaluate(() => {
                const element = document.querySelector('div#portmapping_application_id div.modal-body');
                element.scrollTop = element.scrollHeight; 
            });
            await page.screenshot({ path: '/app/logs/step5131-scrolled-down.png' });
            
            // that takes ages
            await Promise.all([
                page.waitForNetworkIdle({ idleTime: 50 }),
                new Promise(resolve => setTimeout(resolve,900))
            ]);
            await page.screenshot({ path: '/app/logs/step5132-same.png' });
            await page.click('a#portmapping_application_id_add_add_link'); // Add port application


            // that takes ages
            await Promise.all([
                page.waitForNetworkIdle({ idleTime: 50 }),
                new Promise(resolve => setTimeout(resolve,900))
            ]);
            await page.screenshot({ path: '/app/logs/step513-form-created.png' });
            // fields to fill in appear slowly:
            let some = await trySelector(async () => {
                await page.waitForSelector('input#portmapping_application_id_add_edit_application_Name_ctrl');
            }, "Waiting for the add app form...")
            await page.screenshot({ path: '/app/logs/step514-same.png' });

            await page.type('#portmapping_application_id_add_edit_application_Name_ctrl', config.portMapping.name);
            
            // Configure ports
            await page.type('div#application_externalPort div input[data-bind="start"]', config.portMapping.externalPort);
            await page.type('div#application_externalPort div input[data-bind="end"]', config.portMapping.externalPort);
            await page.type('div#application_internalPort div input[data-bind="start"]', config.portMapping.internalPort);
            // < these all had 0 for defaults so are now 4430...
            await page.screenshot({ path: '/app/logs/step52.png' });
            
            // Save application
            await page.click('button#portmapping_application_id_add_edit_submitctrl');
            await Promise.all([
                page.waitForNetworkIdle({ idleTime: 50 }),
                new Promise(resolve => setTimeout(resolve,900))
            ]);
            
            await page.screenshot({ path: '/app/logs/step53.png' });
            await page.click('#portmapping_application_idclose_link_id'); // Close dialog
            

            console.log("Added portforwarding app")

            let appid = await select_portforwarding_app(page)
            await page.screenshot({ path: '/app/logs/step54.png' });
            if (appid == null) {
                throw "!found our portforwarding app after create"
            }
        }
    }


















    
    // select that application + host
    await page.select('select#portmapping_app_id_ctrl',portmapapp_name)
    await page.screenshot({ path: '/app/logs/step6.png' });

    let mac = await select_internal_host(page);

    await page.select('select#nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl',mac)
    await page.screenshot({ path: '/app/logs/step7.png' });
    await page.click('button#nat_pm_view_data_list_multiedit_submitctrl');

    // Wait for network idle and a small timeout
    await Promise.all([
        page.waitForNetworkIdle({ idleTime: 50 }),
        new Promise(resolve => setTimeout(resolve,250))
    ]);

    await page.screenshot({ path: '/app/logs/step8.png' });

    await page.reload()

    await page.screenshot({ path: '/app/logs/step9.png' });
    // Wait for network idle and a small timeout
    await Promise.all([
        page.waitForNetworkIdle({ idleTime: 50 }),
        new Promise(resolve => setTimeout(resolve,250))
    ]);
    await page.screenshot({ path: '/app/logs/step91.png' });
    if (!await mapping_exists()) {
        throw "failed? dont see the mapping"
    }
    await page.screenshot({ path: '/app/logs/step92.png' });


    console.log("Done.")
    if (0) {
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('a');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('a');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria( </a>)'),
            targetPage.locator('tr:nth-of-type(37) > td.line-content'),
            targetPage.locator('::-p-xpath(/html/body/table/tbody/tr[37]/td[2])'),
            targetPage.locator(':scope >>> tr:nth-of-type(37) > td.line-content')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 910,
                y: 6,
              },
            });
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('f');
    }
    {
        const targetPage = page;
        await targetPage.keyboard.up('Tab');
    }
    {
        const targetPage = page;
        await targetPage.keyboard.up('Shift');
    }
    {
        const targetPage = page;
        await targetPage.keyboard.up('Control');
    }
    {
        const targetPage = page;
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await puppeteer.Locator.race([
            targetPage.locator('tr:nth-of-type(114) > td.line-content'),
            targetPage.locator('::-p-xpath(/html/body/table/tbody/tr[114]/td[2])'),
            targetPage.locator(':scope >>> tr:nth-of-type(114) > td.line-content')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 1690,
                y: 2,
              },
            });
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('f');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('f');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('f');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('f');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('r');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('a');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('r');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('a');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria( <li class=\\"pull-left text_center paddingleft_10\\">)'),
            targetPage.locator('tr:nth-of-type(93) > td.line-content'),
            targetPage.locator('::-p-xpath(/html/body/table/tbody/tr[93]/td[2])'),
            targetPage.locator(':scope >>> tr:nth-of-type(93) > td.line-content'),
            targetPage.locator('::-p-text(<li class=\\"pull-left text_center paddingleft_10\\">)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 665,
                y: 6,
              },
            });
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria( <li class=\\"marginright_5 text_center paddingleft_10\\">&nbsp;</li>)'),
            targetPage.locator('tr:nth-of-type(97) > td.line-content'),
            targetPage.locator('::-p-xpath(/html/body/table/tbody/tr[97]/td[2])'),
            targetPage.locator(':scope >>> tr:nth-of-type(97) > td.line-content'),
            targetPage.locator('::-p-text(<li class=\\"marginright_5)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 714,
                y: 0,
              },
            });
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('Escape');
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(Save) >>>> ::-p-aria([role=\\"generic\\"])'),
            targetPage.locator('#i18n-61'),
            targetPage.locator('::-p-xpath(//*[@id=\\"i18n-61\\"])'),
            targetPage.locator(':scope >>> #i18n-61'),
            targetPage.locator('::-p-text(Save)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 19.40625,
                y: 15,
              },
            });
    }
    {
        const targetPage = page;
        await targetPage.keyboard.down('Shift');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(var g_userLang = \\"en\\";)'),
            targetPage.locator('tr:nth-of-type(85) > td.line-content'),
            targetPage.locator('::-p-xpath(/html/body/table/tbody/tr[85]/td[2])'),
            targetPage.locator(':scope >>> tr:nth-of-type(85) > td.line-content'),
            targetPage.locator('::-p-text(var g_userLang)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 1164,
                y: 14,
              },
            });
    }
    {
        const targetPage = page;
        await targetPage.keyboard.up('Shift');
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#i18n-168'),
            targetPage.locator('::-p-xpath(//*[@id=\\"i18n-168\\"])'),
            targetPage.locator(':scope >>> #i18n-168')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 12.4375,
                y: 11,
              },
            });
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(\x3Cscript type=\\"text/x-handlebars\\" data-template-name=\\"lang\\">)'),
            targetPage.locator('tr:nth-of-type(88) > td.line-content'),
            targetPage.locator('::-p-xpath(/html/body/table/tbody/tr[88]/td[2])'),
            targetPage.locator(':scope >>> tr:nth-of-type(88) > td.line-content')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 570,
                y: 8,
              },
            });
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.up('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Shift');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Control');
    }
    {
        const target = await browser.waitForTarget(t => t.url() === 'http://192.168.1.1/html/advance.html', { timeout });
        const targetPage = await target.page();
        targetPage.setDefaultTimeout(timeout);
        await targetPage.keyboard.down('Shift');
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(Save)'),
            targetPage.locator('#nat_pm_view_data_list_multiedit_submitctrl'),
            targetPage.locator('::-p-xpath(//*[@id=\\"nat_pm_view_data_list_multiedit_submitctrl\\"])'),
            targetPage.locator(':scope >>> #nat_pm_view_data_list_multiedit_submitctrl')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 59.546875,
                y: 20,
              },
            });
    }
    }

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
