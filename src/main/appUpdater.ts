import {app, BrowserWindow, ipcMain} from 'electron'
import updater from 'electron-updater'
import {CancellationToken} from 'builder-util-runtime'
import {appendFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'

// electron-updater's CommonJS export is accessed through the default import
// so electron-vite can bundle it consistently in the main process.
const {autoUpdater}=updater
const RELEASES_URL='https://github.com/StankyFangers/NHL-Tracker/releases'
type UpdateInfoResponse={status:'OK'|'NO_RELEASE'|'ERROR';installedVersion:string;latestVersion?:string;releaseUrl?:string;releaseName?:string;message?:string}

export function registerAppUpdater(){
 let availableVersion=''
 let downloadedVersion=''
 let busy=false
 let cancelToken:CancellationToken|null=null
 let lastDownloadProgress=0
 const logPath=join(app.getPath('userData'),'electron-updater.log')
 const log=(level:string,message:string)=>{
  try{mkdirSync(app.getPath('userData'),{recursive:true});appendFileSync(logPath,new Date().toISOString()+' '+level+' '+message+'\n','utf8')}catch{}
 }
 const emit=(value:unknown)=>{
  for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.send('app:update-progress',value)
 }
 autoUpdater.autoDownload=false
 // An accidental app close must not silently install an unapproved update.
 autoUpdater.autoInstallOnAppQuit=false
 autoUpdater.allowPrerelease=false
 autoUpdater.logger={
  info:(...args:unknown[])=>log('INFO',args.map(String).join(' ')),
  warn:(...args:unknown[])=>log('WARN',args.map(String).join(' ')),
  error:(...args:unknown[])=>log('ERROR',args.map(String).join(' ')),
  debug:(...args:unknown[])=>log('DEBUG',args.map(String).join(' '))
 }
 autoUpdater.on('checking-for-update',()=>log('INFO','Checking official GitHub Releases update feed'))
 autoUpdater.on('update-available',info=>{availableVersion=info.version;log('INFO','Update available '+info.version)})
 autoUpdater.on('update-not-available',()=>{availableVersion='';log('INFO','No update available')})
 autoUpdater.on('download-progress',progress=>{
  const percent=Math.min(100,Math.max(0,Number(progress.percent)||0))
  if(Date.now()-lastDownloadProgress<200&&percent<100)return
  lastDownloadProgress=Date.now()
  const speed=Number(progress.bytesPerSecond)||0
  emit({state:'DOWNLOADING',version:availableVersion,received:progress.transferred,total:progress.total,percent,bytesPerSecond:speed,secondsRemaining:speed>0?Math.ceil((progress.total-progress.transferred)/speed):null})
 })
 autoUpdater.on('update-downloaded',info=>{
  downloadedVersion=info.version
  log('INFO','Update downloaded and verified '+info.version)
  emit({state:'READY',version:info.version,percent:100,secondsRemaining:0})
 })
 autoUpdater.on('error',error=>{
  log('ERROR',String(error?.stack||error))
  emit({state:'ERROR',message:String(error?.message||error)})
 })
 const supported=()=>app.isPackaged&&process.platform==='win32'
 ipcMain.handle('app:updateInfo',async():Promise<UpdateInfoResponse>=>{
  const installedVersion=app.getVersion()
  if(!supported())return{status:'ERROR',installedVersion,message:'Update checks require the installed Windows app.'}
  if(busy)return{status:'ERROR',installedVersion,message:'An update download is already in progress.'}
  try{
   const result=await autoUpdater.checkForUpdates()
   if(!result?.updateInfo)return{status:'NO_RELEASE',installedVersion}
   return{status:'OK',installedVersion,latestVersion:result.updateInfo.version,releaseUrl:RELEASES_URL,releaseName:'NHL Tracker v'+result.updateInfo.version}
  }catch(error:any){
   log('ERROR','Check failed: '+String(error?.stack||error))
   return{status:'ERROR',installedVersion,message:String(error?.message||error)}
  }
 })
 ipcMain.handle('app:downloadUpdate',async()=>{
  if(!supported())return{error:'Updates require the installed Windows app.'}
  if(busy)return{error:'An update is already downloading.'}
  if(downloadedVersion&&downloadedVersion===availableVersion){emit({state:'READY',version:downloadedVersion,percent:100});return{ready:true,version:downloadedVersion}}
  if(!availableVersion)return{error:'Check for a newer version before downloading.'}
  busy=true
  cancelToken=new CancellationToken()
  const token=cancelToken
  try{
   emit({state:'PREPARING',version:availableVersion})
   await autoUpdater.downloadUpdate(token)
   if(token.cancelled)return{error:'Download cancelled.'}
   if(downloadedVersion!==availableVersion)return{error:'The download did not finish verification. Try again.'}
   return{ready:true,version:downloadedVersion}
  }catch(error:any){
   const message=token.cancelled?'Download cancelled.':String(error?.message||error)
   log('ERROR','Download failed: '+message)
   emit({state:'ERROR',message})
   return{error:message}
  }finally{busy=false;cancelToken=null}
 })
 ipcMain.handle('app:cancelUpdate',()=>{
  if(!cancelToken)return{cancelled:false}
  cancelToken.cancel()
  log('INFO','Download cancelled by user')
  return{cancelled:true}
 })
 ipcMain.handle('app:installUpdate',()=>{
  if(!supported())return{error:'Installation requires the packaged Windows app.'}
  if(busy||!downloadedVersion||downloadedVersion!==availableVersion)return{error:'Download and verify the update before installing.'}
  log('INFO','User approved quitAndInstall for '+downloadedVersion)
  // Managed by electron-updater. No custom PowerShell coordinator, Node worker,
  // detached pipes or hand-written NSIS command line.
  setImmediate(()=>autoUpdater.quitAndInstall(true,true))
  return{started:true,version:downloadedVersion}
 })
 ipcMain.handle('app:lastUpdateResult',async()=>{
  // Historical custom-coordinator results are intentionally not replayed as
  // errors after switching to electron-updater. The installed version is authoritative.
  return null
 })
 log('INFO','electron-updater registered for '+app.getVersion())
}
