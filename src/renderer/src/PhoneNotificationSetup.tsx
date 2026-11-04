import { useEffect, useState } from 'react'

type NotificationScope = 'ALL' | 'WAGERED'
type ConfirmationProgressMode = 'OFF' | 'FOOTER' | 'SEPARATE'
type PhonePreferences = {
  enabled: boolean
  scope: NotificationScope
  lineupChanges: boolean
  confirmationProgress: ConfirmationProgressMode
}
const STORAGE_KEY = 'nhl:phoneNotifications:telegram:v1'
const DEFAULTS: PhonePreferences = { enabled: false, scope: 'ALL', lineupChanges: false, confirmationProgress: 'OFF' }

function readPreferences(): PhonePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return {
      enabled: saved?.enabled === true,
      scope: saved?.scope === 'WAGERED' ? 'WAGERED' : 'ALL',
      lineupChanges: saved?.lineupChanges === true,
      confirmationProgress: saved?.confirmationProgress === 'FOOTER' || saved?.confirmationProgress === 'SEPARATE' ? saved.confirmationProgress : 'OFF'
    }
  } catch {
    return DEFAULTS
  }
}

const panel: React.CSSProperties = { background: '#102330', border: '1px solid #294455', borderRadius: 12, padding: 20 }
const faint: React.CSSProperties = { color: '#a9c0cd', lineHeight: 1.65 }
const button: React.CSSProperties = { padding: '9px 16px', borderRadius: 8, background: '#173847', color: '#e4f3f6', border: '1px solid #426476', cursor: 'pointer', fontWeight: 700 }

export default function PhoneNotificationSetup({ section }: { section: 'Instructions' | 'Setup' }) {
  const [settings, setSettings] = useState<PhonePreferences>(readPreferences)
  const [connected,setConnected]=useState(false)
  const [loading,setLoading]=useState(false)
  const [notice,setNotice]=useState('')
  const [link,setLink]=useState<{url:string;code:string;expiresInMinutes:number}|null>(null)
  const accountRequest=(action:string,preferences?:PhonePreferences)=>(
    (window.nhlTracker as any).telegramAccountRequest({action,...(preferences?{preferences}:{})})
  )
  const refresh=async()=>{
    const data=await accountRequest('status')
    if(data.error)throw Error(data.error)
    setConnected(!!data.connected)
    if(data.connected)setSettings({enabled:!!data.enabled,scope:data.scope==='WAGERED'?'WAGERED':'ALL',lineupChanges:!!data.lineupChanges,confirmationProgress:['OFF','FOOTER','SEPARATE'].includes(data.confirmationProgress)?data.confirmationProgress:'OFF'})
    if(data.connected)setLink(null)
    return !!data.connected
  }
  useEffect(()=>{if(section!=='Setup')return;let alive=true;(async()=>{try{await refresh()}catch(e){if(alive)setNotice(String(e instanceof Error?e.message:e))}})();return()=>{alive=false}},[section])
  const run=async(action:()=>Promise<void>)=>{setLoading(true);setNotice('');try{await action()}catch(e){setNotice(e instanceof Error?e.message:String(e))}finally{setLoading(false)}}
  const connect=()=>run(async()=>{const result=await accountRequest('start');if(result.error)throw Error(result.error);setLink(result);setNotice('Open Telegram and press Start to link. This code expires in 10 minutes.')})
  const save=()=>run(async()=>{const result=await accountRequest('preferences',settings);if(result.error)throw Error(result.error);setNotice('Notification preferences saved to cloud.')})
  const test=()=>run(async()=>{const result=await accountRequest('test');if(result.error)throw Error(result.error);setNotice('Test notification sent. Check Telegram.')})
  const disconnect=()=>run(async()=>{const result=await accountRequest('disconnect');if(result.error)throw Error(result.error);setConnected(false);setLink(null);setNotice('Telegram disconnected from this account.')})

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) }, [settings])
  const update = (patch: Partial<PhonePreferences>) => setSettings(current => ({ ...current, ...patch }))

  return <div style={{ ...panel, display: 'grid', gap: 18 }}>
    <div>
      <h2 style={{ margin: '0 0 6px' }}>Telegram Phone Notifications</h2>
      <p style={{ ...faint, margin: 0 }}>Get a message on your phone when Daily Faceoff confirms NHL team lines — even when the desktop app is closed, once cloud monitoring is enabled.</p>
    </div>
    {section === 'Instructions' ? <>
      <div style={{ padding: 14, borderRadius: 9, background: '#173342', border: '1px solid #2d5466' }}>
        <strong>How it works</strong>
        <p style={{ ...faint, marginBottom: 0 }}>NHL Tracker checks Daily Faceoff in the cloud, remembers the last projected / confirmed status for each team, and sends a Telegram message when a new confirmation is detected. Your computer does not have to be on.</p>
      </div>
      <ol style={{ ...faint, paddingLeft: 24, margin: 0, display: 'grid', gap: 12 }}>
        <li><strong style={{ color: '#ecf7fa' }}>Install Telegram.</strong> Download Telegram on your phone and create an account. <a href="https://telegram.org/apps" target="_blank" rel="noopener noreferrer" style={{ color: '#76d8ed' }}>Official Telegram apps</a>.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Open NHL Tracker's notification bot.</strong> The Setup screen provides a one-time secure link. You will not need to create your own bot or share a bot token.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Link your account.</strong> Start the bot and use the one-time connection step in Setup to link your Telegram chat to the correct NHL Tracker user.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Choose your alerts.</strong> Receive confirmations for all teams or just teams with pending wagers, plus optional post-confirmation line-change alerts.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Choose a confirmation progress indicator.</strong> Optionally show how many teams in the next scheduled puck-drop group have confirmed their lines, appended to each alert or as a separate message.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Send a test notification.</strong> After connecting, use the test button to confirm that Telegram can reach your phone.</li>
      </ol>
      <div style={{ ...panel, padding: 14 }}>
        <strong>Scheduled confirmation checks</strong>
        <p style={{ ...faint, margin: '8px 0 0' }}>Never before 10:00 AM ET. From 9 hours before puck drop: hourly; 7 hours: every 30 minutes; 4 hours: every 15 minutes; 1 hour: every 5 minutes; final 15 minutes: every minute. Stop after puck drop.</p>
      </div>
      <p style={{ ...faint, margin: 0 }}>Line confirmation notifications are separate from existing desktop alerts about wagers whose projected combinations become broken.</p>
    </> : <>
      <div style={{ padding: 14, background: '#25352e', border: '1px solid #5b6841', borderRadius: 9 }}>
        <strong>Connection status: {connected ? 'Connected' : 'Not connected'}</strong>
        <p style={{ ...faint, margin: '6px 0 0' }}>{connected ? 'Your Telegram chat is linked. Save preferences to the cloud, and send a test message.' : 'Generate a secure one-time code and start the NHL Tracker Telegram bot to link this account.'}</p>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })}/>
        <span><strong>Enable phone notifications</strong><small style={{ display: 'block', ...faint }}>Choose your options and click Save Notification Preferences to Cloud below.</small></span>
      </label>
      <fieldset style={{ border: '1px solid #345363', borderRadius: 9, padding: 14 }} disabled={!settings.enabled}>
        <legend style={{ padding: '0 6px', fontWeight: 700 }}>Notify me for</legend>
        <label style={{ display: 'block', padding: '7px 0', cursor: 'pointer' }}><input type="radio" checked={settings.scope === 'ALL'} onChange={() => update({ scope: 'ALL' })}/> All NHL teams playing that day</label>
        <label style={{ display: 'block', padding: '7px 0', cursor: 'pointer' }}><input type="radio" checked={settings.scope === 'WAGERED'} onChange={() => update({ scope: 'WAGERED' })}/> Only teams with pending wagers</label>
        <label style={{ display: 'block', padding: '12px 0 0', cursor: 'pointer' }}><input type="checkbox" disabled checked={false}/> Notify me when confirmed lines change afterward (not available until lineup-diff monitoring is verified)</label>
      </fieldset>
      <fieldset style={{ border: '1px solid #345363', borderRadius: 9, padding: 14 }} disabled={!settings.enabled}>
        <legend style={{ padding: '0 6px', fontWeight: 700 }}>Next puck-drop confirmation progress</legend>
        <p style={{ ...faint, margin: '0 0 12px' }}>Count confirmed teams in the next upcoming scheduled start-time group. The count is for that start time only, not the entire slate or just your wagered teams.</p>
        <label style={{ display: 'block', padding: '6px 0', cursor: 'pointer' }}><input type="radio" name="progress" checked={settings.confirmationProgress === 'OFF'} onChange={() => update({ confirmationProgress: 'OFF' })}/> Off — no progress count</label>
        <label style={{ display: 'block', padding: '6px 0', cursor: 'pointer' }}><input type="radio" name="progress" checked={settings.confirmationProgress === 'FOOTER'} onChange={() => update({ confirmationProgress: 'FOOTER' })}/> Add to bottom of confirmation messages</label>
        <label style={{ display: 'block', padding: '6px 0', cursor: 'pointer' }}><input type="radio" name="progress" checked={settings.confirmationProgress === 'SEPARATE'} onChange={() => update({ confirmationProgress: 'SEPARATE' })}/> Send a separate progress message when the count changes</label>
        {settings.confirmationProgress !== 'OFF' && <div style={{ marginTop: 12, padding: 12, background: '#173342', border: '1px solid #2d5466', borderRadius: 9 }}>
          <strong style={{ display: 'block', marginBottom: 6 }}>Example {settings.confirmationProgress === 'FOOTER' ? 'message footer' : 'separate message'}</strong>
          {settings.confirmationProgress === 'FOOTER' && <p style={{ ...faint, margin: '0 0 8px' }}>✅ CAR Hurricanes — Lines Confirmed</p>}
          <p style={{ margin: 0 }}>🏒 Next puck drop: 7:00 PM ET — 3/4 teams confirmed (1 remaining)</p>
          <small style={{ ...faint }}>Illustrative only; actual counts will come from the cloud slate monitor. Group advances to the next scheduled start time once the current group begins.</small>
        </div>}
      </fieldset>
      <div style={{ ...panel, padding: 14 }}>
        <strong>Telegram account linking</strong>
        <p style={{ ...faint, margin: '7px 0 10px' }}>The connection link and test message will become available after the Telegram bot and secure backend are configured. No secret bot credentials belong in the desktop app.</p>
        <button type="button" onClick={connect} disabled={loading||connected} style={button}>Connect Telegram</button>
        <button type="button" onClick={()=>void run(async()=>{const ok=await refresh();setNotice(ok?'Telegram is connected.':'Not linked yet. Open Telegram and press Start.')})} disabled={loading} style={{...button,marginLeft:8}}>Refresh Connection</button>
        <button type="button" onClick={test} disabled={loading||!connected} style={{...button,marginLeft:8}}>Send Test Notification</button>
        <button type="button" onClick={disconnect} disabled={loading||!connected} style={{...button,marginLeft:8}}>Disconnect</button>
        {link&&<div style={{marginTop:14,background:'#173342',border:'1px solid #3b6a79',padding:12,borderRadius:8}}>
          <strong>Link code: {link.code}</strong><p style={faint}>Expires in {link.expiresInMinutes} minutes. This code is private; do not share it.</p>
          <a href={link.url} target="_blank" rel="noopener noreferrer" style={{color:'#81e0f5'}}>Open NHL Tracker Bot in Telegram</a>
          <p style={{...faint,marginBottom:0}}>If the link does not open automatically, send <code>/start {link.code}</code> to the NHL Tracker bot. Then click Refresh Connection.</p>
        </div>}
        {notice&&<p role="status" style={{...faint,marginTop:12}}>{notice}</p>}
        {connected&&<button type="button" disabled={loading} style={{...button,marginTop:10,display:'block',background:'#126348'}} onClick={save}>Save Notification Preferences to Cloud</button>}
      </div>
      <p style={{ ...faint, fontSize: 12, margin: 0 }}>Preferences are saved to your cloud account when you click Save Notification Preferences. The local copy is only for display.</p>
    </>}
  </div>
}
