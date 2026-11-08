import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const main=readFileSync(new URL('../src/main/index.ts',import.meta.url),'utf8')
const helper=readFileSync(new URL('../src/main/updateCoordinator.ts',import.meta.url),'utf8')
const nodeHelper=readFileSync(new URL('../src/main/nodeUpdateCoordinator.ts',import.meta.url),'utf8')

test('Updater never closes Electron before coordinator confirms startup',()=>{
 assert.match(main,/const launched=await launchUpdateCoordinator\(config\)/)
 assert.doesNotMatch(main,/launchNodeUpdateCoordinator/)
 assert.match(main,/const launched=await launchUpdateCoordinator\(config\)/)
 assert.match(main,/setTimeout\(\(\)=>app\.quit\(\),350\)/)
 assert.match(helper,/Set-Content -LiteralPath \$ready/)
 assert.match(helper,/if\(!ready\)\{/)
 assert.match(helper,/Installer coordinator failed before startup confirmation/)
})
test('Silent update has bounded wait, exit code check and failure recovery',()=>{
 assert.match(helper,/WaitForExit\(240000\)/)
 assert.match(helper,/process\.ExitCode -ne 0/)
 assert.match(helper,/Save-Result \$false/)
 assert.match(helper,/Start-Process -FilePath \$appExe/)
 assert.match(helper,/last-install\.log/)
 assert.match(helper,/last-update-result\.json/)
})
test('Install passes official updater path from verified staged download',()=>{
 assert.match(main,/const pending=stagedUpdate/)
 assert.match(main,/installer:pending\.path,version:pending\.version/)
 assert.match(main,/app\.isPackaged/)
 assert.doesNotMatch(main,/ELECTRON_RUN_AS_NODE/)
 assert.doesNotMatch(main,/launchNodeUpdateCoordinator/)
})

test('Windows updater captures hidden PowerShell launch errors without quitting Electron',()=>{
 assert.match(helper,/coordinator-startup\.log/)
 assert.match(helper,/stdio:\['ignore','pipe','pipe'\]/)
 assert.match(helper,/child\.stderr\?\.on\('data'/)
 assert.match(helper,/readFile\(startupLogFile,'utf8'\)/)
 assert.match(helper,/NHL Tracker (?:will stay|remains) open/)
})

test('Legacy Node updater helper is not used to install packaged application',()=>{
 assert.match(nodeHelper,/ELECTRON_RUN_AS_NODE:'1'/)
 assert.match(nodeHelper,/windowsVerbatimArguments:true/)
 assert.match(nodeHelper,/path\.dirname\(config\.appExecutable\)/)
 assert.match(nodeHelper,/240000/)
 assert.match(nodeHelper,/fs\.writeFileSync\(config\.ready,'READY'\)/)
 assert.match(nodeHelper,/outcome\(false/)
})

test('Both update launchers use NSIS update mode and preserve custom install directory',()=>{
 assert.match(nodeHelper,/\['--updated','\/S','\/D='\+installDir\]/)
 assert.match(helper,/\$startInfo\.Arguments = '--updated \/S \/D=' \+ \$installDir/)
 assert.match(helper,/\$installDir = Split-Path -Parent \$appExe/)
})
