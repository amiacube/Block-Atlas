/* Start the app, install Playwright separately, and run this file with Node.
 * PLAYWRIGHT_MODULE=/path/to/playwright node scripts/test_browser.cjs
 * ATLAS_WEBKIT=1 adds WebKit; ATLAS_WEBKIT_ONLY=1 runs only WebKit.
 * ATLAS_TEST_URL can point to the extracted static site instead of Vite.
 */
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const Papa = require('papaparse')
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:5173/'
const example = '\ufeffMinecraft block ID,Minecraft block,Bloxd block,Category,Replacement tier,Color difference ΔE00,Minecraft mean sides sRGB,Bloxd mean sides sRGB,Real limitations\r\nminecraft:stone,"Sample, quoted",Test Stone,Rock,Build substitute,4.7,#777777,#828282,"Line one; color only.\nNotes on the next line."\r\nminecraft:barrier,Sample barrier,,Technical,No standalone block,,,,Invisible\r\n'
const minimal = 'Block ID\nstone\n'
const mock = http.createServer((req, res) => {
  if (req.url !== '/blocked.csv') res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  if (req.url === '/custom.csv' || req.url === '/blocked.csv') res.end(example)
  else if (req.url === '/slow.csv') setTimeout(() => res.end(example), 650)
  else if (req.url === '/minimal.csv') res.end(minimal)
  else if (req.url === '/duplicate.csv') res.end('Block ID\nstone\nminecraft:stone\n')
  else if (req.url === '/malformed.csv') res.end('Block ID,Bloxd block\nstone\n')
  else if (req.url === '/wrong-header.csv') res.end('Name,Color\nStone,Gray\n')
  else if (req.url === '/html') res.end('<!doctype html><html><title>Not CSV</title></html>')
  else { res.statusCode = 404; res.end('Not found') }
})
const view = p => p.locator('#block-scroll .glass-ui-scroll__viewport')
const bar = p => p.locator('#block-scroll .glass-ui-scroll__bar[data-orientation="vertical"]')
const row = (p, id) => p.locator(`[data-block-id="minecraft:${id}"]`)
const count = (p, n) => p.locator('.result-count').getByText(new RegExp('^'+n.toLocaleString('en-US')+' blocks?\\b')).waitFor()
const close = async (p, role = 'dialog') => { await p.keyboard.press('Escape'); await p.getByRole(role).waitFor({ state: 'hidden' }) }
const pick = (p, name) => p.getByRole('radio', { name, exact: true })
const sourceButton = p => p.getByRole('button', { name: 'CSV source', exact: true })
const compared = p => p.getByRole('region', { name: 'Comparison', exact: true })
const errorWatch = p => { const errors = []; p.on('pageerror', e => errors.push(e.message)); return errors }
async function loaded(p) {
  p.setDefaultTimeout(13_000)
  await p.goto(base)
  await count(p, 1286)
  await p.locator('tr[data-block-id]').first().waitFor()
  assert.equal(await p.getByText('Registry verified', { exact: true }).count(), 0)
  const footer = p.locator('.list-foot')
  assert.match(await footer.innerText(), /Made and maintained by aCube/)
  for (const [name, href] of [['aCube', 'https://discord.com/users/1079048260943097977'], ['aka (aCuboid)', 'https://bloxd.io/player/aCuboid']]) {
    const credit = footer.getByRole('link', { name, exact: true })
    await credit.waitFor()
    assert.equal(await credit.getAttribute('href'), href)
  }
  await p.evaluate(() => document.fonts.ready.then(() => true))
  await bar(p).waitFor({ state: 'attached' })
}
const downloadTrigger = p => p.getByRole('button', {name:'Download',exact:true})
const exportDialog = p => p.getByRole('dialog', {name:'Download Block Atlas',exact:true})
async function saveFile(p, label, filename, touch=false) {
  const link = exportDialog(p).getByRole('link', {name:'Download '+label,exact:true})
  await link.waitFor()
  assert.equal(await link.getAttribute('download'),filename)
  const [d] = await Promise.all([p.waitForEvent('download'),touch?link.tap():link.click()])
  assert.equal(await d.failure(),null)
  assert.equal(d.suggestedFilename(),filename)
  return fs.readFile(await d.path())
}
async function download(p, bundled = false) {
  await downloadTrigger(p).click()
  const bytes=await saveFile(p,'Original CSV',bundled?'block-atlas-source.csv':'block-atlas-custom-source.csv')
  await close(p)
  return bytes
}
async function downloads(browser, foreign) {
  const specs = [
    ['Spreadsheet CSV','block-atlas.csv','exports/block-atlas.csv'], ['Printable PDF','block-atlas.pdf','exports/block-atlas.pdf'],
    ['Plain text','block-atlas.txt','exports/block-atlas.txt'], ['llms.txt','llms.txt','llms.txt'],
    ['Original CSV','block-atlas-source.csv','data/minecraft-26.3-bloxd.csv'],
  ]
  for (const [width,height,colorScheme] of [[1280,820,'light'],[320,568,'dark']]) {
    const touch=width===320
    const p=await browser.newPage({viewport:{width,height},colorScheme,isMobile:touch,hasTouch:touch,reducedMotion:'reduce',acceptDownloads:true})
    try {
      const errors=errorWatch(p);await loaded(p)
      if (touch) await downloadTrigger(p).tap()
      else {
        await p.getByRole('searchbox',{name:'Search blocks'}).fill('minecraft:heavy_core')
        await count(p,1)
        await downloadTrigger(p).press('Enter')
      }
      await exportDialog(p).getByText(/All 1,286 blocks/).waitFor()
      const box=await exportDialog(p).boundingBox()
      assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height-2, JSON.stringify(box))
      for (const [label,filename,asset] of specs) {
        const href=await exportDialog(p).getByRole('link',{name:'Download '+label,exact:true}).getAttribute('href')
        assert.equal(href,new URL(asset,base).href,'Bundled files must be direct same-origin links')
        assert.deepEqual(await saveFile(p,label,filename,touch),await fs.readFile(path.join(__dirname,'../public',asset)))
      }
      await close(p)
      if (!touch) assert(await downloadTrigger(p).evaluate(e => e===document.activeElement))
      if (!touch) {
        await p.goto(base+'?csv='+encodeURIComponent(foreign+'/custom.csv'))
        await count(p,2)
        await downloadTrigger(p).click()
        await exportDialog(p).getByText(/All 2 blocks from the active CSV/).waitFor()
        const raw=await saveFile(p,'Original CSV','block-atlas-custom-source.csv')
        assert.deepEqual(raw,Buffer.from(example))
        const csv=await saveFile(p,'Spreadsheet CSV','block-atlas-custom.csv')
        const parsed=Papa.parse(csv.toString('utf8'),{header:true,skipEmptyLines:true})
        assert.deepEqual(parsed.errors,[])
        assert.deepEqual(new Set(parsed.data.map(r=>r['Minecraft block ID'])),new Set(['minecraft:stone','minecraft:barrier']))
        assert.equal(parsed.data.find(r=>r['Minecraft block ID']==='minecraft:stone')['Real limitations'],'Line one; color only.\nNotes on the next line.')
        const txt=await saveFile(p,'Plain text','block-atlas-custom.txt')
        assert.match(txt.toString('utf8'),/Sample, quoted\n  ID: minecraft:stone/)
        const llms=await saveFile(p,'llms.txt','llms.txt')
        assert.match(llms.toString('utf8'),/2 Minecraft block IDs/)
        assert.match(llms.toString('utf8'),/\.\/block-atlas-custom\.csv/)
        assert(!llms.toString('utf8').includes(foreign),'Custom source URL leaked into llms.txt')
        const pdf=await saveFile(p,'Printable PDF','block-atlas-custom.pdf')
        assert.equal(pdf.subarray(0,5).toString(),'%PDF-')
        assert.match(pdf.toString('latin1'),/\/Count 2\b/,'Small custom export must not contain the bundled catalog')
        await close(p)
      }
      assert.deepEqual(errors,[])
    } finally {await p.close()}
  }
  console.log(`PASS: ${browser.browserType().name()} bundled and custom CSV/PDF/TXT/llms.txt downloads; original bytes and touch downloads`)
}
async function scrolling(p) {
  assert.equal(await p.locator('.block-table').getAttribute('aria-rowcount'), '1287')
  assert(await p.locator('tr[data-block-id]').count() < 60, 'The list should only mount nearby controls')
  assert.equal(await bar(p).evaluate(e => getComputedStyle(e).opacity), '0')
  const [header, heading, viewport] = await Promise.all(['.masthead', '.block-table thead', '#block-scroll .glass-ui-scroll__viewport'].map(s => p.locator(s).boundingBox()))
  await p.mouse.move(viewport.x + viewport.width / 2, viewport.y + Math.min(230, viewport.height / 2))
  await p.mouse.wheel(0, 660)
  await p.waitForFunction(() => document.querySelector('#block-scroll .glass-ui-scroll__viewport').scrollTop > 400)
  assert.equal((await p.locator('.masthead').boundingBox()).y, header.y)
  assert.equal((await p.locator('.block-table thead').boundingBox()).y, heading.y)
  assert.equal(await view(p).evaluate(e => e.scrollLeft), 0)
  assert.equal(await p.locator('.comparison-scroll .glass-ui-scroll__viewport').evaluate(e => e.scrollTop), 0)
  await p.waitForFunction(() => getComputedStyle(document.querySelector('#block-scroll .glass-ui-scroll__bar')).opacity === '1')
  const thumb = bar(p).locator('.glass-ui-scroll__thumb')
  await thumb.waitFor()
  const t = await thumb.boundingBox()
  assert(t.height >= 10 && t.height < 100, JSON.stringify(t))
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2)
  await p.mouse.down()
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2 + 175, { steps: 10 })
  await p.mouse.up()
  await p.waitForFunction(() => document.querySelector('#block-scroll .glass-ui-scroll__viewport').scrollTop > 10_000)
  await p.mouse.move(50, 43)
  await p.waitForFunction(() => getComputedStyle(document.querySelector('#block-scroll .glass-ui-scroll__bar')).opacity === '0')
  assert.equal(await p.evaluate(() => document.scrollingElement.scrollTop), 0)
  console.log('PASS: wheel, sticky headings, independent panes, and the LiquiKit thumb appears, drags and fades')
}
async function desktop(browser, foreign) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
  try {
    const p = await ctx.newPage(), errors = errorWatch(p)
    const fetched = p.waitForResponse(r => r.ok() && r.url().endsWith('/data/minecraft-26.3-bloxd.csv'))
    await loaded(p); await fetched
    assert.match(await p.locator('body').evaluate(e => getComputedStyle(e).fontFamily), /-apple-system.*Inter Variable/)
    assert(!/Minecraft Java|Java Edition 26\.3/.test(await p.locator('body').innerText()))
    assert(await p.locator('.action-cell button.glass-ui-button').count() > 8)
    await p.waitForFunction(() => [...document.querySelectorAll('.block-table img')].filter(x => x.complete && x.naturalWidth).length > 10)
    await count(p, 1286); await scrolling(p)
    for (const [label, total] of [['World gen', 598], ['Later examples', 10], ['Other IDs', 678], ['All blocks', 1286]]) {
      await pick(p, label).click(); await count(p, total)
      assert.equal(await view(p).evaluate(e => e.scrollTop), 0)
    }
    const category = p.getByRole('combobox', { name: 'Block category' })
    await category.press('ArrowDown'); await p.getByRole('listbox').waitFor()
    await p.getByRole('option', { name: 'Copper & oxidation' }).click(); await count(p, 119)
    assert.match(await category.innerText(), /Copper & oxidation/)
    await p.getByRole('button', { name: 'Hide comparison' }).click(); assert.equal(await compared(p).count(), 0)
    await p.getByRole('button', { name: 'Show comparison' }).click(); await compared(p).waitFor()
    const options = p.getByRole('button', { name: 'View options' })
    const menuChoose = async (name, role = 'menuitemradio') => {
      if (await options.getAttribute('aria-expanded') !== 'true') await options.click()
      await p.getByRole(role, { name, exact: true }).click()
      if (await options.getAttribute('aria-expanded') === 'true') await close(p, 'menu')
    }
    await menuChoose('Reset view', 'menuitem'); await count(p, 1286)
    await menuChoose('No standalone block'); await count(p, 2)
    await row(p, 'structure_void').getByRole('button').click()
    await compared(p).getByText('No comparable visible color was recorded.').waitFor()
    await menuChoose('Reset view', 'menuitem'); await count(p, 1286)
    await menuChoose('Closest color first')
    const scores = (await p.locator('tbody td.score-col').allTextContents()).slice(0, 12).map(Number)
    assert(scores.length === 12 && scores.every((v,i) => Number.isFinite(v) && (!i || v >= scores[i-1])))
    const search = p.getByRole('searchbox', { name: 'Search blocks' })
    await p.keyboard.press('/'); assert(await search.evaluate(e => document.activeElement === e))
    await search.fill('minecraft:oak_log'); await row(p, 'oak_log').getByRole('button').click()
    const panel = compared(p)
    await panel.getByRole('heading', { name: 'Oak Log', exact: true }).waitFor()
    const means = panel.getByRole('table', { name: 'Mean colors by surface' })
    assert.match(await means.getByRole('row', { name: /^Top/ }).innerText(), /12\.7/)
    assert.match(await means.getByRole('row', { name: /^Sides/ }).innerText(), /2\.2/)
    const sourceTexture = () => panel.getByRole('tabpanel').locator('img').first().getAttribute('src')
    const before = await sourceTexture()
    await panel.getByRole('tab', { name: 'Top', exact: true }).click()
    await panel.getByRole('tab', { name: 'Top', exact: true, selected: true }).waitFor()
    assert.notEqual(await sourceTexture(), before)
    await panel.getByRole('button', { name: 'Copy block ID' }).click()
    assert.equal(await p.evaluate(() => navigator.clipboard.readText()), 'minecraft:oak_log')
    await panel.getByRole('button', { name: 'Block data', exact: true }).click()
    await panel.getByText('Minecraft state', { exact: true }).waitFor()
    await search.fill('minecraft:water'); await row(p, 'water').getByRole('button').click()
    await panel.getByRole('button', { name: 'Biome tint samples' }).click(); await panel.getByText('Warm Ocean', { exact: true }).waitFor()
    await menuChoose('Reset view', 'menuitem'); await count(p, 1286)
    await row(p, 'acacia_button').getByRole('button').focus(); await p.keyboard.press('End')
    await p.waitForFunction(() => document.activeElement.closest('tr')?.getAttribute('aria-rowindex') === '1287')
    await p.keyboard.press('Home'); await p.waitForFunction(() => document.activeElement.id === 'inspect-minecraft:acacia_button')
    await p.keyboard.press('ArrowDown'); await p.waitForFunction(() => document.activeElement.id === 'inspect-minecraft:acacia_door')
    await search.fill('not-a-real-block-XZZ'); await p.getByRole('heading', { name: 'No blocks found' }).waitFor()
    await p.getByRole('button', { name: 'Clear filters' }).click(); await count(p, 1286)
    await p.getByRole('button', { name: 'How comparisons work' }).click(); await p.getByRole('heading', {name:'How comparisons work'}).waitFor(); await close(p)
    assert.deepEqual(await download(p, true), await fs.readFile(path.join(__dirname, '../public/data/minecraft-26.3-bloxd.csv')))
    console.log('PASS: collections, search, filtering, sort, keyboard across the list, comparison, face tabs, accordions, and exact bundled export')

    const dialog = p.getByRole('dialog', { name: 'CSV source' })
    const source = async url => { await dialog.getByLabel('CSV URL', { exact: true }).fill(url); await dialog.getByRole('button', { name: 'Load CSV', exact: true }).click() }
    await sourceButton(p).click(); await dialog.waitFor()
    await source('invalid-input'); await dialog.getByRole('alert').getByText(/Use a full https/).waitFor()
    for (const [file,msg] of [['absent.csv',/HTTP 404/],['blocked.csv',/cross-origin requests/],['html',/web page, not CSV/],['wrong-header.csv',/No block ID column/],['duplicate.csv',/duplicate minecraft:stone/],['malformed.csv',/different number of fields/]]) {
      await source(foreign+'/'+file); await dialog.getByRole('alert').getByText(msg).waitFor()
    }
    await close(p); await count(p, 1286)
    assert(await sourceButton(p).evaluate(e => e === document.activeElement))
    await sourceButton(p).click(); await source(foreign+'/slow.csv')
    await dialog.getByRole('button', { name: /^Loading/ }).waitFor(); await dialog.waitFor({ state: 'hidden' })
    await row(p,'stone').getByText('Sample, quoted', { exact: true }).waitFor(); await count(p, 2)
    assert.equal(new URL(p.url()).searchParams.get('csv'), foreign+'/slow.csv')
    await p.getByText(/2 of 1,286 reference IDs/).waitFor()
    assert.deepEqual(await download(p), Buffer.from(example))
    await p.reload(); await row(p, 'stone').waitFor()
    await sourceButton(p).click(); await source(foreign+'/minimal.csv'); await dialog.waitFor({ state: 'hidden' })
    await p.getByText(/no Bloxd replacement column/).waitFor(); await count(p, 1)
    assert.deepEqual(await download(p), Buffer.from(minimal))
    await sourceButton(p).click(); await dialog.getByRole('button', { name: 'Use bundled CSV' }).click()
    await dialog.waitFor({ state: 'hidden' }); await count(p,1286)
    assert.equal(new URL(p.url()).searchParams.get('csv'), null)
    await p.goto(base+'?csv='+encodeURIComponent(foreign+'/custom.csv')); await row(p, 'stone').getByText('Sample, quoted', { exact: true }).waitFor()
    await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForFunction(() => document.documentElement.dataset.appearance === 'dark')
    assert.deepEqual(errors, [])
    console.log('PASS: CSV URL, HTTP/CORS/schema errors, last good data, persistence, reset, and exact custom CSV export (with and without BOM)')
  } finally { await ctx.close() }
}
async function responsive(browser, full) {
  const sizes = full ? [[320,568],[390,844],[720,840],[900,768],[1050,720],[1180,700]] : [[390,844],[1280,840]]
  for (const [width,height] of sizes) {
    const phone = width <= 624
    const p = await browser.newPage({ viewport: { width, height }, isMobile: phone, hasTouch: phone, colorScheme: 'light', reducedMotion: 'reduce' })
    try {
      const errors = errorWatch(p); await loaded(p)
      const d = await p.evaluate(() => ({ w: innerWidth, doc: document.documentElement.scrollWidth, h: innerHeight, docH: document.documentElement.scrollHeight, name: document.querySelector('tr[data-block-id] td').clientWidth, scopeEnd: document.querySelector('.collection-control').getBoundingClientRect().right, facetsLeft: document.querySelector('.facets').getBoundingClientRect().left, scopeBottom: document.querySelector('.collection-control').getBoundingClientRect().bottom, facetsTop: document.querySelector('.facets').getBoundingClientRect().top }))
      assert.equal(d.w, width); assert.equal(d.doc, width); assert.equal(d.h, d.docH)
      assert(d.name > 170, `Clipped block name column: ${JSON.stringify(d)}`)
      assert(d.scopeEnd <= d.facetsLeft+1 || d.scopeBottom <= d.facetsTop+1, `Control overlap: ${JSON.stringify(d)}`)
      if (width === 390) {
        await pick(p, 'Later').tap(); await count(p, 10)
        await pick(p, 'All').tap(); await count(p, 1286)
        if (full) {
          const cdp = await p.context().newCDPSession(p)
          const r = await view(p).boundingBox(), x = Math.round(r.x+r.width/2), y = Math.round(r.y+r.height-110)
          await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y}] })
          for (let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x,y:y-i*29}] })
          await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] })
          await p.waitForFunction(() => document.querySelector('#block-scroll .glass-ui-scroll__viewport').scrollTop > 120)
          await p.waitForTimeout(450)
        }
        await view(p).evaluate(e => { e.scrollTop = 1020 })
        const id = await (await p.waitForFunction(() => {const r=document.querySelector('#block-scroll .glass-ui-scroll__viewport').getBoundingClientRect();return document.elementFromPoint(140,r.top+110)?.closest('tr[data-block-id]')?.dataset.blockId})).jsonValue()
        assert(id)
        const target = p.locator(`[data-block-id="${id}"]`).getByRole('button')
        await target.tap(); await p.getByRole('heading', { name: 'Comparison', exact: true }).waitFor()
        assert(await p.locator('.block-list-panel').evaluate(e => e.inert)); assert.equal(await p.locator('html').evaluate(e => e.scrollWidth), width)
        await p.getByRole('button', { name: 'Back to blocks' }).tap(); await count(p, 1286)
        assert((await view(p).evaluate(e => e.scrollTop)) >= 900)
        assert.equal(await p.evaluate(() => document.activeElement.id), 'inspect-'+id)
        await sourceButton(p).tap(); await p.getByRole('dialog', { name: 'CSV source' }).waitFor(); await close(p)
      } else if (!full) await scrolling(p)
      assert.deepEqual(errors, [])
    } finally { await p.close() }
  }
  console.log(`PASS: responsive ${browser.browserType().name()} layout at ${sizes.map(([w])=>w).join(', ')}px, touch detail and return focus`)
}
async function normalMotion(browser) {
  for (const colorScheme of ['light','dark']) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme, reducedMotion: 'no-preference' })
    try {
      await loaded(p)
      for (const [role, label, modal] of [['combobox','Block category',false],['button','View options',false],['button','CSV source',true],['button','How comparisons work',true],['button','Download',true]]) {
        // Arm sampling in the click capture phase, before Base UI mounts the portal.
        await p.evaluate(() => {
          window.atlasFrames = new Promise(resolve => {
            function record() {
              const frames=[]; let opened, settled=false, start=performance.now()
              function sample() {
                const t = performance.now(), popup=document.querySelector('.glass-ui-popup[data-open]'), scrim=document.querySelector('.glass-ui-alert__backdrop'), text=popup?.querySelector('.glass-pane__content')
                if (popup && text) {
                  opened ??= t
                  const a=getComputedStyle(popup), b=getComputedStyle(text), c=scrim&&getComputedStyle(scrim)
                  settled ||= Number(a.opacity) > .95
                  frames.push({ bg:a.backgroundColor, shadow:a.boxShadow, pane:a.opacity, content:b.opacity, text:b.visibility, blur:b.filter, scrimBlur:c?.backdropFilter, scrim:c?.opacity, shaped:popup.hasAttribute('data-shaped') })
                }
                if ((settled&&opened!==undefined&&t-opened>=240)||t-start>3400) resolve(frames)
                else requestAnimationFrame(sample)
              }
              requestAnimationFrame(sample)
            }
            addEventListener('click',record,{capture:true,once:true})
          })
        })
        await p.getByRole(role, { name: label, exact: true }).click()
        const frames = await p.evaluate(() => window.atlasFrames)
        assert(frames.length >= 1, label)
        assert(frames.some(f=>Number(f.pane)>.95), `No settled content: ${label} ${JSON.stringify(frames.slice(-4))}`)
        for (const f of frames) {
          assert.equal(f.bg, 'rgba(0, 0, 0, 0)', label)
          assert.equal(f.shadow, 'none', label)
          assert(!f.shaped, label)
          assert.equal(f.content, '1', label)
          assert.equal(f.text, 'visible', label)
          assert.equal(f.blur, 'none', label)
          if (modal) {
            assert.equal(f.scrimBlur, 'none', label)
            assert(Number(f.scrim) <= Number(f.pane)+.2, 'Dialog dim appeared well before the content')
          } else assert.equal(f.scrim, undefined, label)
        }
        await close(p, modal ? 'dialog' : role === 'combobox' ? 'listbox' : 'menu')
        await p.locator('.glass-ui-popup[data-open], .glass-ui-popup[data-ending-style]').waitFor({ state:'hidden' })
      }
    } finally { await p.close() }
  }
  console.log(`PASS: ${browser.browserType().name()} normal-motion category, menu, and dialog frames in light and dark`)
}
;(async () => {
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve))
  const foreign = 'http://127.0.0.1:'+mock.address().port
  try {
    if (process.env.ATLAS_WEBKIT_ONLY !== '1') {
      const b = await chromium.launch(); try { await desktop(b, foreign); await responsive(b, true); await normalMotion(b); await downloads(b, foreign) } finally { await b.close() }
    }
    if (process.env.ATLAS_WEBKIT === '1' || process.env.ATLAS_WEBKIT_ONLY === '1') {
      const b = await webkit.launch(); try { await responsive(b, false); await normalMotion(b); await downloads(b, foreign) } finally { await b.close() }
    }
  } finally { mock.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
