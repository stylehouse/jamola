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
    headless: process.env.PUPPETEER_HEADLESS !== 'false'
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
    return await page.evaluate(() => {
        let els = document.querySelectorAll('select#portmapping_app_id_ctrl option[value^="InternetGatewayDevice.Services.X_Application."]')
        els.forEach(sel => {
            let name = sel.textContent.trim()
            if (name == 's') {
                portmapapp_name = sel.value
            }
        })
        return portmapapp_name
    })
}

// which one!?
let pref = [
    'd0:50:99:0b:9d:30', // wired, usually works
    'c4:73:1e:c7:aa:65', 
]
async function select_internal_host() {
    return await page.evaluate(() => {
        let els = document.querySelectorAll('select#nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl option[text^="s_"]')
        let mac_to_hostname = {}
        els.forEach(sel => {
            let mac = sel.value.toLowerCase()
            let name = sel.textContent.trim()
            mac_to_hostname[mac] = name
        })
        let got = null
        pref.map(mac => {
            let name = mac_to_hostname[mac]
            if (name) {
                console.log(`found ${mac} = ${name}`)
                got ||= mac
            }
        })
        if (!got) {
            console.error("only hosts:",mac_to_hostname)
            throw "can't find internal host"
        }
        return go.toUpperCase()
    })
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
    {
        // Check if mapping exists
        console.log('Checking existing mappings...');
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
              console.log('Port forward already exists');
              return;
            }
        }
    
    }


    // Add new mapping
    console.log('Adding new port mapping...');
    await page.click('#nat_pm_view_data_add_link'); // New port mapping button
    await page.waitForSelector('#nat_pm_view_data_list_multiedit_portmapping_Name_ctrl');
    await page.type('#nat_pm_view_data_list_multiedit_portmapping_Name_ctrl', 's');

    await page.screenshot({ path: '/app/logs/step5.png' });

    
    {
        // another list that sometimes already has what we want in it
        //  even if the last one didn't
        
        
        let appid = await select_portforwarding_app(page)
        if (appid != null) {
            console.log("found our portforwarding app")
        }
        else {
            // Add new application
            await page.click('#i18n-58'); // Add port mapping button
            await page.click('#portmapping_application_id_add_add > div');
            await page.type('#portmapping_application_id_add_edit_application_Name_ctrl', config.portMapping.name);
            await page.screenshot({ path: '/app/logs/step51.png' });
            
            // Configure ports
            await page.type('#ember5544 > div:nth-of-type(1) input:nth-of-type(1)', config.portMapping.externalPort);
            await page.type('#ember5544 > div:nth-of-type(1) input:nth-of-type(2)', config.portMapping.externalPort);
            await page.type('#ember5544 > div:nth-of-type(2) input:nth-of-type(1)', config.portMapping.internalPort);
            await page.screenshot({ path: '/app/logs/step52.png' });
            
            await page.click('#i18n-114'); // Save application
            await page.screenshot({ path: '/app/logs/step53.png' });
            await page.click('#portmapping_application_idclose_link_id'); // Close dialog
            


            let appid = await select_portforwarding_app(page)
            await page.screenshot({ path: '/app/logs/step54.png' });
            if (appid != null) {
                throw "!found our portforwarding app after create"
            }
        }
    }


















    
    // select that application
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#portmapping_app_id_ctrl'),
            targetPage.locator('::-p-xpath(//*[@id=\\"portmapping_app_id_ctrl\\"])'),
            targetPage.locator(':scope >>> #portmapping_app_id_ctrl'),
        ])
            .setTimeout(timeout)
            .fill(portmapapp_name);
        await page.screenshot({ path: '/app/logs/step6.png' });
    }
    // and a host!
    {
        let mac = await select_internal_host(page);
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl'),
            targetPage.locator('::-p-xpath(//*[@id=\\"nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl\\"])'),
            targetPage.locator(':scope >>> #nat_pm_view_data_list_multiedit_nat_portmaping_internalHost_ctrl'),
        ])
            .setTimeout(timeout)
            .fill(mac);
        await page.screenshot({ path: '/app/logs/step7.png' });
    }
    {
        const targetPage = page;
        await targetPage.keyboard.down('Control');
    }
    {
        const targetPage = page;
        await targetPage.keyboard.down('u');
    }
    {
        const targetPage = page;
        await targetPage.goto('http://192.168.1.1/html/advance.html#nat');
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
            targetPage.locator('button#nat_pm_view_data_list_multiedit_submitctrl'),
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 1143,
                y: 1,
              },
            });
    }

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
