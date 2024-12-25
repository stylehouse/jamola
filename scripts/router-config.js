import puppeteer from 'puppeteer';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const config = {
    routerUrl: process.env.ROUTER_URL || 'http://192.168.1.1',
    username: process.env.ROUTER_USERNAME,
    password: process.env.ROUTER_PASSWORD,
    checkInterval: parseInt(process.env.CHECK_INTERVAL, 10) || 600000, // 10 minutes
    headless: process.env.PUPPETEER_HEADLESS !== 'false'
};

let texts = (els) => els.forEach(div => div.textContent.trim())
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
    }
    {
        const targetPage = page;
        await targetPage.goto('http://192.168.1.1/');

        await page.screenshot({ path: '/app/logs/step1.png' });
    }
    {
        await page.type('#index_username', '!!Huawei');
        await page.screenshot({ path: '/app/logs/step2.png' });
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#password'),
            targetPage.locator('::-p-xpath(//*[@id=\\"password\\"])'),
            targetPage.locator(':scope >>> #password')
        ])
            .setTimeout(timeout)
            .fill('@HuaweiHgw');
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(Log in)'),
            targetPage.locator('#loginbtn'),
            targetPage.locator('::-p-xpath(//*[@id=\\"loginbtn\\"])'),
            targetPage.locator(':scope >>> #loginbtn'),
            targetPage.locator('::-p-text(Log in)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 53,
                y: 21,
              },
            });
    }
    {
        const targetPage = page;
        const promises = [];
        const startWaitingForEvents = () => {
            promises.push(targetPage.waitForNavigation());
        }
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(X)'),
            targetPage.locator('#confirm_window'),
            targetPage.locator('::-p-xpath(//*[@id=\\"confirm_window\\"])'),
            targetPage.locator(':scope >>> #confirm_window'),
            targetPage.locator('::-p-text(X)')
        ])
            .setTimeout(timeout)
            .on('action', () => startWaitingForEvents())
            .click({
              offset: {
                x: 5.34375,
                y: 13.96875,
              },
            });
        await Promise.all(promises);
    }
    {
        const targetPage = page;
        const promises = [];
        const startWaitingForEvents = () => {
            promises.push(targetPage.waitForNavigation());
        }
        await puppeteer.Locator.race([
            targetPage.locator('#internet_settings_menu > div'),
            targetPage.locator('::-p-xpath(//*[@id=\\"internet_settings_menu\\"]/div)'),
            targetPage.locator(':scope >>> #internet_settings_menu > div')
        ])
            .setTimeout(timeout)
            .on('action', () => startWaitingForEvents())
            .click({
              offset: {
                x: 96,
                y: 21,
              },
            });
        await Promise.all(promises);
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('::-p-aria(Forwarding) >>>> ::-p-aria([role=\\"generic\\"])'),
            targetPage.locator('li:nth-of-type(9) font'),
            targetPage.locator('::-p-xpath(//*[@id=\\"nat_menuId\\"]/font)'),
            targetPage.locator(':scope >>> li:nth-of-type(9) font'),
            targetPage.locator('::-p-text(Forwarding)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 65,
                y: 5,
              },
            });
    }
    // < here we should look at the port mappings and abort if exists?
    // 
    {
        let is_fine = false
        await page.evaluate(() => {
            let els = document.querySelectorAll('div#nat_pm_view_data_list > div[id^=nat_pm_view_data_list_InternetGatewayDevice_Services_X_Portmapping]  div[id$="_data"] div div')
        
            // since els is an array, "s" == one member
            if (texts(els).includes("s")) {
                is_fine = true
            }
        })
        if (is_fine) {
            // < abort now, happily
            return console.log("already port forwarded")
        }
    
    }













    // New port mapping
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#i18n-28'),
            targetPage.locator('::-p-xpath(//*[@id=\\"i18n-28\\"])'),
            targetPage.locator(':scope >>> #i18n-28'),
            targetPage.locator('::-p-text(New port mapping)')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 36,
                y: 9,
              },
            });
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#nat_pm_view_data_list_multiedit_portmapping_Name_ctrl'),
            targetPage.locator('::-p-xpath(//*[@id=\\"nat_pm_view_data_list_multiedit_portmapping_Name_ctrl\\"])'),
            targetPage.locator(':scope >>> #nat_pm_view_data_list_multiedit_portmapping_Name_ctrl')
        ])
            .setTimeout(timeout)
            .click({
              offset: {
                x: 59.03125,
                y: 11,
              },
            });
    }
    {
        const targetPage = page;
        await puppeteer.Locator.race([
            targetPage.locator('#nat_pm_view_data_list_multiedit_portmapping_Name_ctrl'),
            targetPage.locator('::-p-xpath(//*[@id=\\"nat_pm_view_data_list_multiedit_portmapping_Name_ctrl\\"])'),
            targetPage.locator(':scope >>> #nat_pm_view_data_list_multiedit_portmapping_Name_ctrl')
        ])
            .setTimeout(timeout)
            .fill('s');
    }

    
    {
        // another list that sometimes already has what we want in it
        //  even if the last one didn't
        
        
        let appid = await select_portforwarding_app()
        if (appid != null) {
            console.log("found our portforwarding app")
        }
        else {
            // add application
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#i18n-58'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"i18n-58\\"])'),
                    targetPage.locator(':scope >>> #i18n-58'),
                    targetPage.locator('::-p-text(Add port mapping)')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 124.03125,
                        y: 8,
                    },
                    });
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#portmapping_application_id_add_add > div'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"portmapping_application_id_add_add\\"]/div)'),
                    targetPage.locator(':scope >>> #portmapping_application_id_add_add > div')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 12.953125,
                        y: 12.40625,
                    },
                    });
            }
            // fill in name
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#portmapping_application_id_add_edit_application_Name_ctrl'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"portmapping_application_id_add_edit_application_Name_ctrl\\"])'),
                    targetPage.locator(':scope >>> #portmapping_application_id_add_edit_application_Name_ctrl')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 65.25,
                        y: 18.40625,
                    },
                    });
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#portmapping_application_id_add_edit_application_Name_ctrl'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"portmapping_application_id_add_edit_application_Name_ctrl\\"])'),
                    targetPage.locator(':scope >>> #portmapping_application_id_add_edit_application_Name_ctrl')
                ])
                    .setTimeout(timeout)
                    .fill('s');
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#ember5544 > div:nth-of-type(1)'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"application_externalPort\\"])'),
                    targetPage.locator(':scope >>> #ember5544 > div:nth-of-type(1)')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 117.859375,
                        y: 6.40625,
                    },
                    });
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#ember5544 > div:nth-of-type(1) input:nth-of-type(1)'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"ember5560\\"]/input[1])'),
                    targetPage.locator(':scope >>> #ember5544 > div:nth-of-type(1) input:nth-of-type(1)')
                ])
                    .setTimeout(timeout)
                    .fill('443');
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#ember5560'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"ember5560\\"])'),
                    targetPage.locator(':scope >>> #ember5560'),
                    targetPage.locator('::-p-text(443         )')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 54.265625,
                        y: 15.40625,
                    },
                    });
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#ember5544 > div:nth-of-type(1) input:nth-of-type(2)'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"ember5560\\"]/input[2])'),
                    targetPage.locator(':scope >>> #ember5544 > div:nth-of-type(1) input:nth-of-type(2)')
                ])
                    .setTimeout(timeout)
                    .fill('443');
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#ember5544 > div:nth-of-type(2)'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"application_internalPort\\"])'),
                    targetPage.locator(':scope >>> #ember5544 > div:nth-of-type(2)')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 181.859375,
                        y: 12.40625,
                    },
                    });
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#ember5544 > div:nth-of-type(2) input:nth-of-type(1)'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"ember5582\\"]/input[1])'),
                    targetPage.locator(':scope >>> #ember5544 > div:nth-of-type(2) input:nth-of-type(1)')
                ])
                    .setTimeout(timeout)
                    .fill('9443');
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#i18n-114'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"i18n-114\\"])'),
                    targetPage.locator(':scope >>> #i18n-114')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 16.40625,
                        y: 6.40625,
                    },
                    });
            }
            {
                const targetPage = page;
                await puppeteer.Locator.race([
                    targetPage.locator('#portmapping_application_idclose_link_id'),
                    targetPage.locator('::-p-xpath(//*[@id=\\"portmapping_application_idclose_link_id\\"])'),
                    targetPage.locator(':scope >>> #portmapping_application_idclose_link_id')
                ])
                    .setTimeout(timeout)
                    .click({
                    offset: {
                        x: 4.296875,
                        y: 7.40625,
                    },
                    });
            }
            let appid = await select_portforwarding_app()
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
