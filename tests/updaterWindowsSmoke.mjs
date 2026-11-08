import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,readFileSync as read,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import ts from 'typescript'

if(process.platform!=='win32')throw Error('Windows-only smoke test')
const source=readFileSync(new URL('../src/main/updateCoordinator.ts',import.meta.url),'utf8')
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const module={exports:{}}
new Function('module','exports','require',js)(module,module.exports,createRequire(import.meta.url))
const {launchUpdateCoordinator}=module.exports
const userData=mkdtempSync(join(tmpdir(),'NHL Tracker Updater Smoke '))
// This tests the real detached PowerShell startup + handshake.
// dryRun prevents installation and exiting/restarting NHL Tracker.
const started=await launchUpdateCoordinator({
 installer:join(userData,'unused installer.exe'),version:'9.9.9-smoke',
 appExecutable:join(userData,'unused app.exe'),userData,parentPid:process.pid,dryRun:true
})
assert.equal(started.started,true)
assert.equal(existsSync(join(userData,'update-cache','coordinator-ready.txt')),true)
console.log('Coordinator handshake passed in Windows with spaces in path')
console.log(read(join(userData,'update-cache','coordinator-startup.log'),'utf8').slice(-1500))
