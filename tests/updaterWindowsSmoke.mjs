import assert from 'node:assert/strict'
import {readFileSync,mkdtempSync,readFileSync as read,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import ts from 'typescript'

if(process.platform!=='win32')throw Error('Windows-only smoke test')
const require=createRequire(import.meta.url)
function loadModule(filename){
 const source=readFileSync(new URL(filename,import.meta.url),'utf8')
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const module={exports:{}}
 new Function('module','exports','require',js)(module,module.exports,require)
 return module.exports
}
const {launchUpdateCoordinator}=loadModule('../src/main/updateCoordinator.ts')
const {launchNodeUpdateCoordinator}=loadModule('../src/main/nodeUpdateCoordinator.ts')
const userData=mkdtempSync(join(tmpdir(),'NHL Tracker Updater Smoke '))
// This tests the real detached PowerShell startup + handshake.
// dryRun prevents installation and exiting/restarting NHL Tracker.
let started
try {
 started=await launchUpdateCoordinator({
 installer:join(userData,'unused installer.exe'),version:'9.9.9-smoke',
 appExecutable:join(userData,'unused app.exe'),userData,parentPid:process.pid,dryRun:true
})
} catch (error) {
 const script=join(userData,'update-cache','install-coordinator.ps1')
 const log=join(userData,'update-cache','coordinator-startup.log')
 console.error('Windows coordinator smoke test failed:',error)
 console.error('Generated coordinator script:\n',read(script,'utf8'))
 console.error('Startup diagnostics:\n',existsSync(log)?read(log,'utf8'):'No startup log')
 throw error
}
assert.equal(started.started,true)
assert.equal(existsSync(join(userData,'update-cache','coordinator-ready.txt')),true)
console.log('Coordinator handshake passed in Windows with spaces in path')
console.log(read(join(userData,'update-cache','coordinator-startup.log'),'utf8').slice(-1500))

const runtimeExecutable=require('electron')
const nodeStarted=await launchNodeUpdateCoordinator({
 installer:join(userData,'unused installer.exe'),version:'9.9.9-smoke',
 appExecutable:join(userData,'unused app.exe'),userData,parentPid:process.pid,dryRun:true,
 runtimeExecutable
})
assert.equal(nodeStarted.started,true)
assert.equal(existsSync(join(userData,'update-cache','node-coordinator-ready.txt')),true)
console.log('Detached Electron-as-Node coordinator handshake passed, with custom path spaces')
console.log(read(join(userData,'update-cache','node-coordinator.log'),'utf8').slice(-1500))
