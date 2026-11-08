import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const file=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8')
const main=file('src/main/index.ts')
const updater=file('src/main/appUpdater.ts')
const preload=file('src/preload/index.ts')
const ui=file('src/renderer/src/App.tsx')
const pkg=JSON.parse(file('package.json'))

test('Electron updater is the only active installer path',()=>{
 assert.match(main,/registerAppUpdater\(\)/)
 assert.doesNotMatch(main,/launchNodeUpdateCoordinator|launchUpdateCoordinator\(config\)/)
 assert.doesNotMatch(main,/ipcMain\.handle\('app:installUpdate'/)
 assert.match(updater,/autoUpdater\.quitAndInstall\(true,true\)/)
 assert.doesNotMatch(updater,/spawn\(|powershell\.exe|ELECTRON_RUN_AS_NODE/)
})

test('Explicit check, download and install retain the existing renderer IPC contract',()=>{
 for(const method of ['app:updateInfo','app:downloadUpdate','app:cancelUpdate','app:installUpdate','app:lastUpdateResult'])
  assert.ok(updater.includes("ipcMain.handle('"+method+"'"),method)
 assert.match(updater,/autoUpdater\.autoDownload=false/)
 assert.match(updater,/autoUpdater\.autoInstallOnAppQuit=false/)
 assert.match(updater,/await autoUpdater\.checkForUpdates\(\)/)
 assert.match(updater,/await autoUpdater\.downloadUpdate\(token\)/)
 assert.match(updater,/new CancellationToken\(\)/)
 assert.match(updater,/update-downloaded/)
 assert.match(updater,/download-progress/)
 assert.match(preload,/app:update-progress/)
 assert.match(ui,/INSTALL & RESTART/)
})

test('GitHub NSIS installer has the same app identity and update metadata publisher',()=>{
 assert.equal(pkg.version,'1.8.13')
 assert.equal(pkg.build.appId,'com.nhltracker.app')
 assert.equal(pkg.build.productName,'NHL Tracker')
 assert.equal(pkg.build.executableName,'NHL Tracker')
 assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false)
 assert.equal(pkg.build.nsis.allowToChangeInstallationDirectory,true)
 assert.equal(pkg.build.win.target[0].target,'nsis')
 assert.deepEqual(pkg.build.publish,[{provider:'github',owner:'StankyFangers',repo:'NHL-Tracker',releaseType:'release'}])
 assert.equal(pkg.dependencies['electron-updater'],'6.8.11')
 assert.equal(pkg.dependencies['builder-util-runtime'],'9.7.0')
 assert.match(pkg.build.artifactName,/NHL\.Tracker\.Setup/)
})
