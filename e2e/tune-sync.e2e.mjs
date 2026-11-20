// tune-sync.e2e.mjs — Tune this app's own rows follow the account
// (James, 2026-10-30: "mobile app and web app settings in tune this app should
// be saved and synced to their account … Global rule"; @unisim/sdk 0.232.0
// createSyncedSettings, src/stores/invoicesSettings.ts).
//
//   npm run test:tune-sync   (dev server up: npm run dev, or E2E_BASE_URL;
//                             PLAYWRIGHT_MODULE = any checkout's playwright/index.js)
//
// Supabase is mocked at the network: every /auth/v1, /rest/v1 and
// /functions/v1 request is answered here, and `user_app_prefs` is ONE table in
// this process, so two browser contexts signed in as the same person are two
// devices on one account. A signed-in context carries a made-up session in
// localStorage ('universal-suite-auth', where the SDK keeps it off the
// .unisim.co.uk zone), so the SDK's real sync runs, not its offline mock.
//
//   • signed out: Hide invoices persists over a reload and nothing is sent;
//   • settings from before (useUserPrefs' bag) move onto the store, unsent;
//   • the account's OLD `invoices` row is adopted once — a brand-new device
//     gets the tab order and Hide invoices, writes them to `tune-app:invoices`
//     stamped, and a later device takes them from there (the old row unread);
//   • signed in: a change goes to `tune-app:invoices` as { at, values } only;
//     a second device follows, newest wins, Reset follows, reopening is quiet.

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173/'

const PRODUCT = 'invoices'
const ROW = `tune-app:${PRODUCT}`
const STORE_KEY = `unisim:settings:${PRODUCT}`
const HIDE = /Hide invoices/

const PLAYWRIGHT_CANDIDATES = [
  '../node_modules/playwright/index.js',
  '../../Universal_Exports/node_modules/playwright/index.js',
  '../../Universal_Video/node_modules/playwright/index.js',
  '../../../backoffice/universal-platform/node_modules/playwright/index.js',
]

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, ...PLAYWRIGHT_CANDIDATES.map((rel) => join(HERE, rel))].filter(Boolean)
  for (const file of candidates) {
    let mod
    try {
      const m = await import(pathToFileURL(file).href)
      mod = m.default ?? m
    } catch { continue }
    try {
      const probe = await mod.chromium.launch()
      await probe.close()
      return mod
    } catch { /* next */ }
  }
  console.error('No usable Playwright found (set PLAYWRIGHT_MODULE).')
  process.exit(2)
}

const failures = []
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    failures.push(label)
  }
}

// ── The mocked account ───────────────────────────────────────────────────────

/** user_app_prefs: { uid: { app: data } }, and every upsert. */
const table = {}
const upserts = []

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(uid) {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  const user = {
    id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@example.invalid`,
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
    created_at: '2026-01-01T00:00:00Z', is_anonymous: false,
  }
  const access_token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated', aal: 'aal1', email: user.email, session_id: `s-${uid}` })}.sig`
  return { access_token, refresh_token: `r-${uid}`, token_type: 'bearer', expires_in: 365 * 24 * 3600, expires_at: exp, user }
}
function uidOf(request) {
  const token = (request.headers().authorization ?? '').replace(/^Bearer\s+/i, '')
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub ?? null } catch { return null }
}

async function answer(route) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const uid = uidOf(req)
  if (path.startsWith('/auth/v1/user')) {
    return uid ? route.fulfill({ json: sessionFor(uid).user }) : route.fulfill({ status: 401, json: { message: 'no session' } })
  }
  if (path.startsWith('/auth/v1/')) return route.fulfill({ json: {} })
  if (path === '/rest/v1/user_app_prefs') {
    if (req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '[]')
      for (const row of [].concat(body)) {
        upserts.push(row)
        table[row.user_id] = { ...(table[row.user_id] ?? {}), [row.app]: row.data }
      }
      return route.fulfill({ status: 201, body: '' })
    }
    const mine = uid ? (table[uid] ?? {}) : {}
    const eq = url.searchParams.get('app')
    let rows = Object.entries(mine).map(([app, data]) => ({ app, data, user_id: uid }))
    if (eq?.startsWith('eq.')) rows = rows.filter((r) => r.app === eq.slice(3))
    else if (eq?.startsWith('in.(')) {
      const list = eq.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''))
      rows = rows.filter((r) => list.includes(r.app))
    }
    if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) {
      return rows[0]
        ? route.fulfill({ json: rows[0] })
        : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } })
    }
    return route.fulfill({ json: rows })
  }
  if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({ json: null })
  if (path.startsWith('/rest/v1/')) {
    if ((req.headers().accept ?? '').includes('vnd.pgrst.object')) return route.fulfill({ status: 406, json: { code: 'PGRST116' } })
    return route.fulfill({ json: [] })
  }
  return route.fulfill({ json: {} })
}


const playwright = await loadPlaywright()
const browser = await playwright.chromium.launch()
const errors = []

async function device({ uid = null, seed = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await context.route(/\/(auth|rest|functions|storage)\/v1\//, answer)
  await context.route(/\/realtime\/v1\//, (r) => r.abort())
  const session = uid ? sessionFor(uid) : null
  await context.addInitScript(([session, seed]) => {
    if (sessionStorage.getItem('tune-sync:seeded')) return
    sessionStorage.setItem('tune-sync:seeded', '1')
    if (session) localStorage.setItem('universal-suite-auth', JSON.stringify(session))
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v)
  }, [session, seed])
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  const tabOrderRows = () => page.locator('fieldset:has(legend:text-is("Tab order")) li')
  return {
    page,
    close: () => context.close(),
    open: async () => {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
    },
    tune: async () => {
      // The SDK's openTuneThisApp(), from outside the bundle.
      await page.evaluate(() => {
        window.__unisimTuneThisAppRequested = true
        window.dispatchEvent(new CustomEvent('unisim:open-tune-this-app'))
      })
      await page.getByRole('checkbox', { name: HIDE }).first().waitFor({ timeout: 10000 })
    },
    hidden: () => page.getByRole('checkbox', { name: HIDE }).first().isChecked(),
    toggleHide: async () => {
      await page.getByRole('checkbox', { name: HIDE }).first().click()
      await page.waitForTimeout(400)
    },
    firstTab: async () => (await tabOrderRows().first().textContent())?.replace(/[↑↓]/g, '').trim(),
    moveUp: async (label) => {
      await page.getByRole('button', { name: `Move ${label} up` }).first().click()
      await page.waitForTimeout(400)
    },
    reset: async () => {
      // The SDK asks first, in place.
      await page.locator('[data-testid="unisim-prefs-reset"] button:has-text("Reset to defaults")').first().click()
      await page.waitForTimeout(300)
      await page.locator('[data-testid="unisim-prefs-reset"] button', { hasText: /^Reset$/ }).first().click()
      await page.waitForTimeout(600)
    },
    stored: () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), STORE_KEY),
  }
}
const rowUps = (uid) => upserts.filter((u) => u.app === ROW && (!uid || u.user_id === uid))
const KEYS = '["hideInvoices","tabOrder"]'

try {
  console.log('\nsigned out: this device only')
  {
    const a = await device()
    await a.open()
    await a.tune()
    check('Hide invoices starts unticked', !(await a.hidden()))
    check('…and the tabs start in the app’s order', (await a.firstTab()) === 'Your companies', await a.firstTab())
    await a.toggleHide()
    check('…ticks and is saved on the device', (await a.hidden()) && (await a.stored())?.hideInvoices === true, JSON.stringify(await a.stored()))
    await a.open()
    await a.tune()
    check('a reload keeps it', await a.hidden())
    check('nothing is sent to an account', rowUps().length === 0, JSON.stringify(upserts))
    await a.close()
  }

  console.log('\nsettings from before (this device’s useUserPrefs bag) are kept')
  {
    const a = await device({
      uid: 'u-old',
      seed: { 'unisim:prefs:invoices': JSON.stringify({ hideInvoices: true, tabOrder: ['clients', 'companies', 'documents', 'catalogue'], activeCompany: 'c1' }) },
    })
    await a.open()
    await a.tune()
    check('the old Hide invoices shows ticked', await a.hidden())
    check('…and the old tab order', (await a.firstTab()) === 'Clients', await a.firstTab())
    const s = await a.stored()
    check('…moved onto the store', s?.hideInvoices === true && s.tabOrder?.[0] === 'clients', JSON.stringify(s))
    check('…and, never changed here (and no old row on the account), not sent', rowUps('u-old').length === 0, JSON.stringify(rowUps()))
    await a.close()
  }

  console.log('\nthe account’s old `invoices` row is adopted once')
  {
    table['u-mig'] = { invoices: { tabOrder: ['catalogue', 'clients', 'companies', 'documents'], hideInvoices: true, activeCompany: 'c9' } }
    const b = await device({ uid: 'u-mig' })
    await b.open()
    await b.tune()
    check('a brand-new device opens with Hide invoices ticked', await b.hidden())
    check('…and the account’s tab order', (await b.firstTab()) === 'Catalogue', await b.firstTab())
    const ups = rowUps('u-mig')
    const data = ups[0]?.data
    check('…and writes them to tune-app:invoices once, stamped', ups.length === 1 && typeof data?.at === 'number' && data.at > 0
      && data.values.hideInvoices === true && data.values.tabOrder?.[0] === 'catalogue'
      && JSON.stringify(Object.keys(data).sort()) === '["at","values"]' && JSON.stringify(Object.keys(data.values).sort()) === KEYS, JSON.stringify(ups))
    // The old row changes (an old build, say): the account has moved, so nobody follows it.
    table['u-mig'].invoices = { ...table['u-mig'].invoices, hideInvoices: false, tabOrder: ['documents'] }
    const c = await device({ uid: 'u-mig' })
    await c.open()
    await c.tune()
    check('a later brand-new device takes them from the new row', (await c.hidden()) && (await c.firstTab()) === 'Catalogue', await c.firstTab())
    check('…and sends nothing', rowUps('u-mig').length === 1, JSON.stringify(rowUps('u-mig')))
    await b.open()
    await c.open()
    check('reopening both sends nothing more', rowUps('u-mig').length === 1)
    await b.close()
    await c.close()

    // A device that had them all along (its useUserPrefs bag mirrors the old row).
    table['u-mig2'] = { invoices: { hideInvoices: true } }
    const d = await device({ uid: 'u-mig2', seed: { 'unisim:prefs:invoices': JSON.stringify({ hideInvoices: true }) } })
    await d.open()
    await d.tune()
    const ups2 = rowUps('u-mig2')
    check('an existing device also writes the new row once (nothing changed on it)', (await d.hidden()) && ups2.length === 1 && ups2[0].data.values.hideInvoices === true, JSON.stringify(ups2))
    await d.open()
    check('…and only once', rowUps('u-mig2').length === 1)
    await d.close()
  }

  console.log('\nsigned in: two devices on one account')
  {
    const a = await device({ uid: 'u1' })
    const b = await device({ uid: 'u1' })
    await a.open()
    check('opening the app sends nothing', rowUps('u1').length === 0, JSON.stringify(rowUps('u1')))
    await a.tune()
    await a.toggleHide()
    const ups = rowUps('u1')
    const data = ups.at(-1)?.data
    check('A ticks Hide invoices → one write to tune-app:invoices, for this account', ups.length === 1, JSON.stringify(ups))
    check('…holding only the stamp and the settings', data && JSON.stringify(Object.keys(data).sort()) === '["at","values"]'
      && data.values.hideInvoices === true && JSON.stringify(Object.keys(data.values).sort()) === KEYS, JSON.stringify(data))
    await b.open()
    await b.tune()
    check('B opens with it ticked', await b.hidden())
    check('…and sends nothing back', rowUps('u1').length === 1)
    await b.moveUp('Documents')
    check('B moves a tab → written', rowUps('u1').length === 2 && rowUps('u1')[1].data.values.tabOrder?.[0] === 'documents', JSON.stringify(rowUps('u1').at(-1)))
    await a.open()
    await a.tune()
    check('A, reopened, has both', (await a.hidden()) && (await a.firstTab()) === 'Documents', await a.firstTab())
    await b.toggleHide()
    await a.open()
    await a.tune()
    check('B unticks again → A follows (newest wins)', !(await a.hidden()) && (await a.firstTab()) === 'Documents')
    await a.reset()
    const last = rowUps('u1').at(-1)?.data?.values
    check('A resets to defaults → the defaults are written', last && last.hideInvoices === false && last.tabOrder === null, JSON.stringify(last))
    await b.open()
    await b.tune()
    check('…and B is back to them too', !(await b.hidden()) && (await b.firstTab()) === 'Your companies', await b.firstTab())
    const before = rowUps('u1').length
    await a.open()
    await b.open()
    check('reopening both sends nothing more', rowUps('u1').length === before)
    await a.close()
    await b.close()
  }

  check('no page errors', errors.length === 0, errors[0])
} finally {
  await browser.close()
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed')
process.exit(failures.length ? 1 : 0)
