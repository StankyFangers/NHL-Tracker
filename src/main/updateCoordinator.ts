import {spawn} from 'node:child_process'
import {mkdir,readFile,unlink,writeFile,appendFile} from 'node:fs/promises'
import {join} from 'node:path'

type UpdateConfig={installer:string;version:string;appExecutable:string;userData:string;parentPid:number;dryRun?:boolean}
const ps=(value:string)=>"'"+value.replace(/'/g,"''")+"'"

/** Standalone Windows coordinator with a startup acknowledgment before Electron quits. */
export async function launchUpdateCoordinator(config:UpdateConfig){
 const dir=join(config.userData,'update-cache')
 await mkdir(dir,{recursive:true})
 const scriptPath=join(dir,'install-coordinator.ps1')
 const readyFile=join(dir,'coordinator-ready.txt')
 const resultFile=join(config.userData,'last-update-result.json')
 const logFile=join(dir,'last-install.log')
 await unlink(readyFile).catch(()=>{})
 const script=[
  "$ErrorActionPreference = 'Stop'",
  '$installer = '+ps(config.installer),
  '$appExe = '+ps(config.appExecutable),
  '$result = '+ps(resultFile),
  '$ready = '+ps(readyFile),
  '$log = '+ps(logFile),
  '$targetVersion = '+ps(config.version),
  '$parentPid = '+config.parentPid,
  '$dryRun = '+(config.dryRun?'$true':'$false'),
  'function Log($message) {',
  '  try { Add-Content -LiteralPath $log -Value ((Get-Date -Format o).ToString() + " " + $message) -Encoding UTF8 } catch {}',
  '}',
  'function Save-Result($ok,$message) {',
  '  try {',
  '    $payload = @{ok=[bool]$ok;version=$targetVersion;message=[string]$message}',
  '    [System.IO.File]::WriteAllText($result,($payload | ConvertTo-Json -Compress),([System.Text.UTF8Encoding]::new($false)))',
  '  } catch { Log ("Could not save result: " + $_.Exception.Message) }',
  '}',
  'Write-Output ("COORDINATOR_BOOT ready=" + $ready)',
  '$installFailed = $false',
  'try {',
  "  Set-Content -LiteralPath $ready -Value 'READY' -Encoding ASCII",
  '  Log ("Coordinator started for " + $targetVersion)',
  "  if ($dryRun) { Log 'Smoke test finished before exit, installer untouched'; exit 0 }",
  '  $elapsed = 0',
  '  while ((Get-Process -Id $parentPid -ErrorAction SilentlyContinue) -and $elapsed -lt 30000) {',
  '    Start-Sleep -Milliseconds 300',
  '    $elapsed += 300',
  '  }',
  "  if (Get-Process -Id $parentPid -ErrorAction SilentlyContinue) { throw 'NHL Tracker did not exit within 30 seconds.' }",
  "  Log 'Electron exited. Starting installer.'",
  "  if (-not (Test-Path -LiteralPath $installer)) { throw 'Downloaded installer file is missing.' }",
  '  $startInfo = New-Object System.Diagnostics.ProcessStartInfo',
  '  $startInfo.FileName = $installer',
  "  $startInfo.Arguments = '/S'",
  '  $startInfo.UseShellExecute = $true',
  '  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden',
  '  $process = [System.Diagnostics.Process]::Start($startInfo)',
  "  if ($null -eq $process) { throw 'Could not start NSIS installer.' }",
  '  Log ("Installer process started PID " + $process.Id)',
  '  if (-not $process.WaitForExit(240000)) {',
  '    try { $process.Kill() } catch {}',
  "    throw 'Installer did not complete within four minutes.'",
  '  }',
  '  Log ("Installer exit code " + $process.ExitCode)',
  "  if ($process.ExitCode -ne 0) { throw ('Installer returned exit code ' + $process.ExitCode) }",
  "  if (-not (Test-Path -LiteralPath $appExe)) { throw 'NHL Tracker executable not found after upgrade.' }",
  '  Start-Sleep -Milliseconds 700',
  '  $installed = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($appExe).ProductVersion',
  '  Log ("Installed executable reports version " + $installed)',
  '  if ($installed -and $installed -notlike ($targetVersion + "*")) {',
  "    throw ('Installer completed but executable version is ' + $installed + ' instead of ' + $targetVersion)",
  '  }',
  "  Save-Result $true ('Installed NHL Tracker v' + $targetVersion)",
  '} catch {',
  '  $installFailed = $true',
  '  $failureText = $_.Exception.ToString()',
  '  [Console]::Error.WriteLine("COORDINATOR_ERROR: " + $failureText)',
  '  Log ("INSTALL FAILED: " + $failureText)',
  '  Save-Result $false $_.Exception.Message',
  '} finally {',
  '  try {',
  '    if (Test-Path -LiteralPath $appExe) {',
  "      Log 'Restarting NHL Tracker'",
  '      Start-Process -FilePath $appExe',
  "    } else { Log 'Cannot restart because NHL Tracker executable is missing' }",
  '  } catch { Log ("Restart failed: " + $_.Exception.ToString()) }',
  '}',
  'if ($installFailed) { exit 1 }'
 ].join('\r\n')
 await writeFile(scriptPath,script,'utf8')
 // Capture PowerShell's *pre-handshake* stdout/stderr. Previously stdio:'ignore'
 // meant a startup crash provided no actionable evidence.
 const startupLogFile=join(dir,'coordinator-startup.log')
 await writeFile(startupLogFile,'Starting PowerShell update coordinator for '+config.version+'\r\n','utf8')
 // Pipes remain valid for the lifetime of the spawned process. Closing a
 // parent-owned file descriptor immediately after spawn can leave the detached
 // Windows child without a usable stderr channel.
 // Windows PowerShell's -File argument handling is unreliable here for
 // generated scripts under userData paths containing spaces. Invoke the
 // absolute script path through UTF-16LE EncodedCommand instead.
 const invocation='& '+ps(scriptPath)
 const encodedInvocation=Buffer.from(invocation,'utf16le').toString('base64')
 const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',encodedInvocation],{
  // On Windows, CREATE_NEW_PROCESS_GROUP/DETACHED_PROCESS can cause
  // PowerShell to exit without executing the script when started async.
  // Windows child processes survive parent exit without detached:true.
  detached:false,stdio:['ignore','pipe','pipe'],windowsHide:true
 })
 child.stdout?.on('data',chunk=>{void appendFile(startupLogFile,chunk).catch(()=>{})})
 child.stderr?.on('data',chunk=>{void appendFile(startupLogFile,chunk).catch(()=>{})})
 let failed:string|null=null
 let startupOutput=''
 child.stdout?.on('data',chunk=>{startupOutput+=String(chunk).slice(0,4000)})
 child.stderr?.on('data',chunk=>{startupOutput+=String(chunk).slice(0,4000)})
 child.on('error',error=>{failed=error.message})
 let ready=false
 for(let i=0;i<140;i++){
  if(failed)break
  try{ready=(await readFile(readyFile,'ascii')).trim()==='READY';if(ready)break}catch{}
  if(child.exitCode!==null||child.signalCode!==null)break
  await new Promise(resolve=>setTimeout(resolve,150))
 }
 if(!ready){
  try{child.kill()}catch{}
  // Surface exit status and the actual generated script when a Windows runner
  // cannot execute the coordinator. A single startup banner is not diagnostic.
  await new Promise(resolve=>setTimeout(resolve,250))
  const stderr=(await readFile(startupLogFile,'utf8').catch(()=>'' )).trim().slice(-2500)
  const diagnostic=[failed||'Installer coordinator failed before startup confirmation.',
   'exit='+String(child.exitCode),'signal='+String(child.signalCode),
   startupOutput?'PowerShell output: '+startupOutput.slice(-2500):'',
   stderr?'Startup log: '+stderr:'',
   'Generated script: '+scriptPath,'Diagnostic log: '+startupLogFile,
   'NHL Tracker will stay open.'].filter(Boolean).join(' | ')
  throw new Error(diagnostic)
 }
 child.unref()
 return {started:true,logFile,startupLogFile}
}
