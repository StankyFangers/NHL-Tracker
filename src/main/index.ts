import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const NHL = 'https://api-web.nhle.com/v1'

// Keep development data completely separate from the installed NHL Tracker profile.
// This lets the stable installed build stay open with real wagers while npm run dev
// uses disposable/test data under its own Electron userData directory.
if (is.dev) {
  app.setName('NHL Tracker Dev')
  app.setPath('userData', join(homedir(), 'AppData', 'Roaming', 'NHL Tracker Dev'))
}

async function nhlJson(path: string) {
  const response = await fetch(`${NHL}${path}`, {
    headers: { 'User-Agent': 'NHL-Tracker/1.0.0', Accept: 'application/json' },
    cache: 'no-store'
  })
  if (!response.ok) throw new Error(`NHL request failed: ${response.status} ${response.statusText}`)
  return response.json()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0b1017',
    title: is.dev ? 'NHL Tracker Dev' : 'NHL Tracker',
    icon: is.dev ? join(process.cwd(), 'resources/money-puck.png') : join(process.resourcesPath, 'money-puck.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  mainWindow.setMenuBarVisibility(false)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId(is.dev ? 'com.nhltracker.app.dev' : 'com.nhltracker.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  ipcMain.handle('nhl:score', async (_e, date?: string) => nhlJson(date ? `/score/${date}` : '/score/now'))
  ipcMain.handle('nhl:pbp', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/play-by-play`))
  ipcMain.handle('nhl:landing', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/landing`))
  ipcMain.handle('nhl:boxscore', async (_e, gameId: number) => nhlJson(`/gamecenter/${gameId}/boxscore`))
  ipcMain.handle('nhl:roster', async (_e, team: string) => nhlJson(`/roster/${encodeURIComponent(team)}/current`))
  ipcMain.handle('nhl:standings', async () => nhlJson('/standings/now'))
  ipcMain.handle('nhl:clubStats', async (_e, team: string) => nhlJson(`/club-stats/${encodeURIComponent(team)}/now`))
  ipcMain.handle('app:notify', async (_e, payload: { title: string; body: string }) => { if (Notification.isSupported()) new Notification({ title: payload.title, body: payload.body, silent: true }).show(); return true })
  ipcMain.handle('app:updateInfo', async () => {
    const installedVersion = app.getVersion()
    try {
      const response = await fetch('https://api.github.com/repos/StankyFangers/NHL-Tracker/releases/latest', {
        headers: { 'User-Agent': `NHL-Tracker/${installedVersion}`, Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      })
      if (response.status === 404) return { status: 'NO_RELEASE', installedVersion }
      if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText}`)
      const release:any = await response.json()
      return { status: 'OK', installedVersion, latestVersion: String(release?.tag_name || '').replace(/^v/i,''), releaseUrl: release?.html_url || 'https://github.com/StankyFangers/NHL-Tracker/releases', releaseName: release?.name || release?.tag_name || '' }
    } catch (error:any) {
      return { status: 'ERROR', installedVersion, message: error?.message || 'Unable to check GitHub releases.' }
    }
  })
  ipcMain.handle('app:openUpdateUrl', async (_e, url: string) => {
    const target = String(url || '')
    if (!/^https:\/\/github\.com\/StankyFangers\/NHL-Tracker(?:\/|$)/i.test(target)) throw new Error('Blocked update URL')
    await shell.openExternal(target)
    return true
  })

  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
