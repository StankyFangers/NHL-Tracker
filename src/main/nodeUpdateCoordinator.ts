import {spawn} from 'node:child_process'
import {mkdir,readFile,unlink,writeFile} from 'node:fs/promises'
import {join} from 'node:path'

type Config={installer:string;version:string;appExecutable:string;userData:string;parentPid:number;dryRun?:boolean;runtimeExecutable?:string}

const worker = String.raw`
'use strict'
const fs=require('node:fs')
const cp=require('node:child_process')
const path=require('node:path')
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const log=line=>{try{fs.appendFileSync(config.log,new Date().toISOString()+' '+line+'\r\n')}catch{}}
const outcome=(ok,message)=>{try{fs.writeFileSync(config.result,JSON.stringify({ok,version:config.version,message}))}catch(e){log('Could not save result '+e.message)}}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}}
const run=async()=>{
 // A startup acknowledgement must be written BEFORE Electron exits.
 fs.writeFileSync(config.ready,'READY')
 log('Node updater started; pid='+process.pid+', target='+config.version)
 if(config.dryRun){log('Dry-run startup passed; no installation or restart');return}
 let failure=null
 try{
  const start=Date.now()
  while(alive(config.parentPid)&&Date.now()-start<30000)await sleep(250)
  if(alive(config.parentPid))throw Error('NHL Tracker did not exit within 30 seconds')
  if(!fs.existsSync(config.installer))throw Error('Downloaded NSIS installer was not found')
  const original=fs.existsSync(config.appExecutable)?fs.statSync(config.appExecutable).mtimeMs:0
  log('Starting NSIS update installer '+config.installer+' target='+path.dirname(config.appExecutable))
  // NSIS /D= must be the final, unquoted argument. Explicitly point it
  // at the running app's folder, including custom paths with spaces.
  const installDir=path.dirname(config.appExecutable)
  const status=await new Promise((resolve,reject)=>{
   const child=cp.spawn(config.installer,['--updated','/S','/D='+installDir],{
    windowsHide:true,stdio:'ignore',windowsVerbatimArguments:true
   })
   let settled=false
   const timer=setTimeout(()=>{
    if(settled)return
    settled=true
    try{child.kill()}catch{}
    reject(Error('NSIS installer timed out after four minutes'))
   },240000)
   child.on('error',error=>{if(!settled){settled=true;clearTimeout(timer);reject(error)}})
   child.on('exit',(code,signal)=>{if(!settled){settled=true;clearTimeout(timer);resolve({code,signal})}})
  })
  log('Installer exit='+JSON.stringify(status))
  if(status.code!==0)throw Error('Installer failed: '+JSON.stringify(status))
  if(!fs.existsSync(config.appExecutable))throw Error('Installed NHL Tracker executable missing')
  const changed=fs.statSync(config.appExecutable).mtimeMs
  if(original&&changed<=original)throw Error('Installer finished but original application executable was not replaced (check custom install folder)')
  log('Verified existing executable was replaced at '+config.appExecutable)
  outcome(true,'Installer completed and updated the NHL Tracker executable')
 }catch(e){failure=e;log('INSTALL FAILED '+(e.stack||e));outcome(false,String(e.message||e))}
 try{
  if(fs.existsSync(config.appExecutable)){
   const child=cp.spawn(config.appExecutable,[],{detached:true,stdio:'ignore',windowsHide:false})
   child.unref()
   log('Relaunch requested')
  }else log('Relaunch impossible, app executable missing')
 }catch(e){log('RELAUNCH FAILED '+(e.stack||e))}
 if(failure)process.exitCode=1
}
run().catch(e=>{log('COORDINATOR CRASH '+(e.stack||e));process.exitCode=1})
`

export async function launchNodeUpdateCoordinator(config:Config){
 const dir=join(config.userData,'update-cache')
 await mkdir(dir,{recursive:true})
 const scriptPath=join(dir,'node-update-worker.cjs')
 const configPath=join(dir,'node-update-config.json')
 const readyFile=join(dir,'node-coordinator-ready.txt')
 const logFile=join(dir,'node-coordinator.log')
 const resultFile=join(config.userData,'last-update-result.json')
 await unlink(readyFile).catch(()=>{})
 await writeFile(scriptPath,worker,'utf8')
 await writeFile(configPath,JSON.stringify({
  installer:config.installer,version:config.version,appExecutable:config.appExecutable,
  parentPid:config.parentPid,dryRun:!!config.dryRun,ready:readyFile,result:resultFile,log:logFile
 }),'utf8')
 const child=spawn(config.runtimeExecutable||config.appExecutable,[scriptPath,configPath],{
  detached:true,windowsHide:true,stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}
 })
 let failed=''
 child.on('error',err=>{failed=err.message})
 for(let i=0;i<70;i++){
  try{
   if((await readFile(readyFile,'ascii')).trim()==='READY'){child.unref();return {started:true,logFile}}
  }catch{}
  if(failed||child.exitCode!==null||child.signalCode!==null)break
  await new Promise(resolve=>setTimeout(resolve,150))
 }
 try{child.kill()}catch{}
 const log=(await readFile(logFile,'utf8').catch(()=>'' )).slice(-1200)
 throw Error('Node updater could not start: '+(failed||log||'no startup confirmation')+'. NHL Tracker remains open.')
}
