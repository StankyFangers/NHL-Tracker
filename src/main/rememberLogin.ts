import {app, safeStorage} from 'electron'
import {readFileSync, writeFileSync, renameSync, rmSync} from 'fs'
import {join} from 'path'

// Credentials never enter renderer storage. Windows protects this file with DPAPI.
export function rememberLogin(environment: 'test'|'live', handler: (...args:any[])=>Promise<any>) {
 const file=join(app.getPath('userData'), `remember-login-${environment}.bin`)
 const clear=()=>{rmSync(file,{force:true});rmSync(file+'.tmp',{force:true})}
 const supported=()=>safeStorage.isEncryptionAvailable() &&
  !(process.platform==='linux' && safeStorage.getSelectedStorageBackend()==='basic_text')
 return async (event:any, incoming:any)=>{
  let payload={...incoming}
  const restore=payload.action==='restore'
  if(payload.action==='logout') clear() // Clear even when the server is offline.
  if(restore){
   try {
    if(!supported())return {account:null}
    const saved=JSON.parse(safeStorage.decryptString(readFileSync(file)))
    if(typeof saved.login!=='string'||typeof saved.password!=='string') {clear();return {account:null}}
    payload={action:'login',login:saved.login,password:saved.password}
   }catch{return {account:null}}
  }
  const remember=payload.rememberSession===true
  delete payload.rememberSession
  if(remember&&!supported())return {error:'Secure credential storage is unavailable. Uncheck Stay logged in to sign in without saving.'}
  const result=await handler(event,payload)
  if(result?.account && ['login','register','bootstrap_dev'].includes(payload.action)){
   if(!restore){
    if(remember){
     try{
      const encrypted=safeStorage.encryptString(JSON.stringify({login:payload.login||payload.username,password:payload.password}))
      writeFileSync(file+'.tmp',encrypted,{mode:0o600});renameSync(file+'.tmp',file)
     }catch{clear();return {...result,rememberWarning:'Signed in, but your login could not be saved. Please sign in again next time.'}}
    }else clear()
   }
  }
  return result
 }
}
