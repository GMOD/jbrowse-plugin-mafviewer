import { type ChildProcess, execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

import { launch } from 'puppeteer'

import type { Browser, Page } from 'puppeteer'

export const JBROWSE_PORT = 9876

const TEST_JBROWSE_VERSION = process.env.TEST_JBROWSE_VERSION || 'nightly'
const TEST_JBROWSE_DIR = path.join(
  process.cwd(),
  `.test-jbrowse-${TEST_JBROWSE_VERSION}`,
)

export async function waitForServer(
  port: number,
  pathToCheck = '/',
  timeout = 30_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(`http://localhost:${port}${pathToCheck}`, res => {
          if (res.statusCode === 200) {
            resolve()
          } else {
            reject(new Error(`Server returned ${res.statusCode}`))
          }
        })
        req.on('error', reject)
        req.setTimeout(1000, () => {
          req.destroy()
          reject(new Error('Request timeout'))
        })
      })
      return
    } catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  throw new Error(`Server on port ${port} did not start within ${timeout}ms`)
}

export function setupJBrowse() {
  console.log('Setting up JBrowse test instance...')

  if (!fs.existsSync(TEST_JBROWSE_DIR)) {
    throw new Error(
      `JBrowse directory not found at ${TEST_JBROWSE_DIR}. ` +
        `Run: jbrowse create ${TEST_JBROWSE_DIR} --nightly`,
    )
  }

  console.log(`Testing against JBrowse version: ${TEST_JBROWSE_VERSION}`)

  const distDir = path.join(process.cwd(), 'dist')
  const skipBuild =
    process.env.SKIP_BUILD === '1' || process.env.SKIP_BUILD === 'true'

  if (skipBuild && fs.existsSync(distDir)) {
    console.log('Skipping build (SKIP_BUILD is set and dist exists)')
  } else {
    console.log('Building plugin bundle...')
    fs.rmSync(distDir, { recursive: true, force: true })
    execSync('yarn build', {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: 120_000,
    })
  }

  console.log('Setting up config...')
  const testConfig = createTestConfig()
  fs.writeFileSync(
    path.join(TEST_JBROWSE_DIR, 'config.json'),
    JSON.stringify(testConfig, null, 2),
  )

  console.log('Copying plugin...')
  const pluginDir = path.join(TEST_JBROWSE_DIR, 'plugin')
  fs.mkdirSync(pluginDir, { recursive: true })
  fs.cpSync(path.join(process.cwd(), 'dist'), pluginDir, { recursive: true })

  console.log('JBrowse test instance ready!')
}

function createTestConfig() {
  return {
    plugins: [
      {
        name: 'MafViewer',
        url: `http://localhost:${JBROWSE_PORT}/plugin/jbrowse-plugin-mafviewer.umd.production.min.js`,
      },
    ],
    assemblies: [
      {
        name: 'hg38',
        aliases: ['GRCh38'],
        sequence: {
          type: 'ReferenceSequenceTrack',
          trackId: 'P6R5xbRqRr',
          adapter: {
            type: 'BgzipFastaAdapter',
            fastaLocation: {
              uri: 'https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz',
            },
            faiLocation: {
              uri: 'https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.fai',
            },
            gziLocation: {
              uri: 'https://jbrowse.org/genomes/GRCh38/fasta/hg38.prefix.fa.gz.gzi',
            },
          },
        },
        refNameAliases: {
          adapter: {
            type: 'RefNameAliasAdapter',
            location: {
              uri: 'https://s3.amazonaws.com/jbrowse.org/genomes/GRCh38/hg38_aliases.txt',
            },
          },
        },
      },
    ],
    tracks: [
      {
        type: 'MafTrack',
        trackId: 'bigMaf',
        name: 'bigMaf test',
        adapter: {
          type: 'BigMafAdapter',
          samples: [
            'hg38',
            'panTro4',
            'rheMac3',
            'mm10',
            'rn5',
            'canFam3',
            'monDom5',
          ],
          bigBedLocation: {
            uri: 'https://jbrowse.org/demos/maf/hg38/bigMaf.bb',
          },
        },
        assemblyNames: ['hg38'],
      },
    ],
    defaultSession: {
      name: 'MAF test session',
    },
  }
}

let jbrowseServer: ChildProcess | undefined

function killProcessOnPort(port: number) {
  try {
    execSync(`lsof -ti:${port} | xargs -r kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
    })
  } catch {
    // port might not be in use
  }
}

export async function startJBrowseServer() {
  console.log(`Starting JBrowse server on port ${JBROWSE_PORT}...`)
  killProcessOnPort(JBROWSE_PORT)

  return new Promise<ChildProcess>((resolve, reject) => {
    const proc = spawn(
      'npx',
      ['serve', '-p', String(JBROWSE_PORT), '-s', TEST_JBROWSE_DIR],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error('Server did not start within 30000ms'))
    }, 30_000)

    const onData = (data: Buffer) => {
      const str = data.toString()
      console.log(`[jbrowse-server] ${str}`)

      const match = /Accepting connections at http:\/\/localhost:(\d+)/.exec(str)
      if (match) {
        const actualPort = Number.parseInt(match[1], 10)
        if (actualPort !== JBROWSE_PORT) {
          clearTimeout(timeout)
          proc.kill()
          reject(
            new Error(
              `Server started on wrong port ${actualPort}, expected ${JBROWSE_PORT}`,
            ),
          )
          return
        }

        clearTimeout(timeout)
        jbrowseServer = proc
        setTimeout(() => {
          console.log('JBrowse server started!')
          resolve(proc)
        }, 500)
      }
    }

    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)
    proc.on('error', err => {
      clearTimeout(timeout)
      reject(err)
    })
    proc.on('exit', code => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout)
        reject(new Error(`Server exited with code ${code}`))
      }
    })
  })
}

export async function stopServer(proc: ChildProcess) {
  return new Promise<void>(resolve => {
    if (proc.killed) {
      resolve()
      return
    }
    proc.on('close', () => {
      resolve()
    })
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL')
      }
      resolve()
    }, 5000)
  })
}

export async function cleanupJBrowse() {
  if (jbrowseServer) {
    await stopServer(jbrowseServer)
  }
}

export async function launchBrowser(headless = true) {
  return launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
}

export async function createJBrowsePage(browser: Browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  page.on('console', msg => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      console.log(`[browser ${type}] ${msg.text()}`)
    }
  })
  page.on('pageerror', err => {
    console.log(`[browser page error] ${err.message}`)
  })
  page.on('requestfailed', request => {
    console.log(
      `[request failed] ${request.url()}: ${request.failure()?.errorText}`,
    )
  })

  const jbrowseUrl = `http://localhost:${JBROWSE_PORT}/?loc=chr22_KI270731v1_random:1-10,000&assembly=hg38&tracks=bigMaf&sessionName=test`
  console.log(`Navigating to: ${jbrowseUrl}`)
  await page.goto(jbrowseUrl, { waitUntil: 'networkidle2', timeout: 60_000 })
  return page
}

export async function waitForJBrowseLoad(page: Page) {
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#root')
      return root && root.children.length > 0
    },
    { timeout: 30_000 },
  )
  console.log('React app mounted')

  try {
    await page.waitForSelector('canvas', { timeout: 30_000 })
    console.log('Canvas found')
  } catch {
    console.log('No canvas found after 30s, continuing anyway...')
    await page.screenshot({ path: 'debug-no-canvas.png' })
  }

  await new Promise(r => setTimeout(r, 3000))
}

export async function waitForTrackLoad(page: Page) {
  try {
    await page.waitForSelector('canvas', { timeout: 30_000 })
    console.log('Track canvas found')
  } catch {
    console.log('No track canvas found, continuing...')
  }
  await new Promise(r => setTimeout(r, 3000))
}
