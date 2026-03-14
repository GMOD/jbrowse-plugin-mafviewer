import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  cleanupJBrowse,
  createJBrowsePage,
  launchBrowser,
  setupJBrowse,
  startJBrowseServer,
  stopServer,
  waitForJBrowseLoad,
  waitForTrackLoad,
} from './setup'

import type { ChildProcess } from 'node:child_process'
import type { Browser, Page } from 'puppeteer'

const JBROWSE_VERSION = process.env.TEST_JBROWSE_VERSION || 'nightly'
const SCREENSHOT_DIR = path.join('test-screenshots', JBROWSE_VERSION)

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

function screenshot(name: string) {
  return path.join(SCREENSHOT_DIR, `${name}.png`)
}

describe('MafViewer Plugin E2E', () => {
  let server: ChildProcess | undefined
  let browser: Browser | undefined
  let page: Page | undefined
  const pluginErrors: string[] = []

  beforeAll(async () => {
    setupJBrowse()
    server = await startJBrowseServer()
    browser = await launchBrowser()
    page = await createJBrowsePage(browser)

    page.on('console', msg => {
      const text = msg.text()
      if (
        msg.type() === 'error' &&
        (text.includes('plugin') || text.includes('Plugin'))
      ) {
        pluginErrors.push(text)
      }
    })

    await waitForJBrowseLoad(page)
    await waitForTrackLoad(page)
  }, 180_000)

  afterAll(async () => {
    if (browser) {
      await browser.close()
    }
    if (server) {
      await stopServer(server)
    }
    await cleanupJBrowse()
  })

  it('should load JBrowse without errors', async () => {
    expect(page).toBeDefined()
    const root = await page!.$('#root')
    expect(root).not.toBeNull()
    await page!.screenshot({ path: screenshot('jbrowse-loaded') })
  }, 30_000)

  it('should load the MafViewer plugin without errors', async () => {
    expect(page).toBeDefined()

    if (pluginErrors.length > 0) {
      console.log('Plugin errors:', pluginErrors)
    }
    expect(pluginErrors).toHaveLength(0)

    const pluginLoaded = await page!.evaluate(() => {
      // @ts-expect-error JBrowse global
      const session = window.__jbrowse_session
      if (session) {
        const plugins = session.jbrowse?.plugins || []
        return plugins.some(
          (p: { name: string }) =>
            p.name === 'MafViewer' ||
            p.name === 'MafViewerPlugin' ||
            p.name === 'jbrowse-plugin-mafviewer',
        )
      }
      const scripts = Array.from(document.querySelectorAll('script'))
      return scripts.some(s => s.src?.includes('mafviewer'))
    })

    console.log(`Plugin loaded: ${pluginLoaded}`)
    expect(pluginLoaded).toBe(true)
  }, 30_000)

  it('should render MAF track without crashing', async () => {
    expect(page).toBeDefined()
    await new Promise(r => setTimeout(r, 5000))
    await page!.screenshot({ path: screenshot('maf-track-rendered') })

    const canvasCount = await page!.$$eval('canvas', els => els.length)
    console.log(`Canvas elements found: ${canvasCount}`)
    expect(canvasCount).toBeGreaterThan(0)
  }, 60_000)

  it('should match image snapshot', async () => {
    expect(page).toBeDefined()
    await new Promise(r => setTimeout(r, 2000))

    // Hide the header bar which contains a timestamp
    await page!.evaluate(() => {
      const header = document.querySelector('header')
      if (header) {
        ;(header as HTMLElement).style.display = 'none'
      }
    })

    const image = await page!.screenshot()
    expect(image).toMatchImageSnapshot()

    // Restore header
    await page!.evaluate(() => {
      const header = document.querySelector('header')
      if (header) {
        ;(header as HTMLElement).style.display = ''
      }
    })
  }, 30_000)
})
