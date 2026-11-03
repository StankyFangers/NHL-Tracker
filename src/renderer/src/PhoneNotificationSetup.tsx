import { useEffect, useState } from 'react'

type NotificationScope = 'ALL' | 'WAGERED'
type PhonePreferences = {
  enabled: boolean
  scope: NotificationScope
  lineupChanges: boolean
}
const STORAGE_KEY = 'nhl:phoneNotifications:telegram:v1'
const DEFAULTS: PhonePreferences = { enabled: false, scope: 'ALL', lineupChanges: false }

function readPreferences(): PhonePreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    return {
      enabled: saved?.enabled === true,
      scope: saved?.scope === 'WAGERED' ? 'WAGERED' : 'ALL',
      lineupChanges: saved?.lineupChanges === true
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
        <li><strong style={{ color: '#ecf7fa' }}>Open NHL Tracker's notification bot.</strong> Once the bot is provisioned, the Setup screen will provide its verified link. You will not need to create your own bot or share a bot token.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Link your account.</strong> Start the bot and use the one-time connection step in Setup to link your Telegram chat to the correct NHL Tracker user.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Choose your alerts.</strong> Receive confirmations for all teams or just teams with pending wagers, plus optional post-confirmation line-change alerts.</li>
        <li><strong style={{ color: '#ecf7fa' }}>Send a test notification.</strong> After connecting, use the test button to confirm that Telegram can reach your phone.</li>
      </ol>
      <div style={{ ...panel, padding: 14 }}>
        <strong>Scheduled confirmation checks</strong>
        <p style={{ ...faint, margin: '8px 0 0' }}>Morning: initial projected snapshot near 10 AM ET. More than 60 minutes before puck drop: every 30 minutes. From 60 to 15 minutes: every 5 minutes. <strong style={{ color: '#e9fcf5' }}>Final 15 minutes: every minute.</strong> Stop when lines are confirmed or the game begins.</p>
      </div>
      <p style={{ ...faint, margin: 0 }}>Line confirmation notifications are separate from existing desktop alerts about wagers whose projected combinations become broken.</p>
    </> : <>
      <div style={{ padding: 14, background: '#25352e', border: '1px solid #5b6841', borderRadius: 9 }}>
        <strong>Connection status: Not connected</strong>
        <p style={{ ...faint, margin: '6px 0 0' }}>Telegram account linking and test-message delivery require the cloud bot endpoint. This local development screen does not send notifications yet.</p>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })}/>
        <span><strong>Enable phone notifications</strong><small style={{ display: 'block', ...faint }}>Preference is saved on this computer for development; delivery remains inactive until your Telegram account is linked.</small></span>
      </label>
      <fieldset style={{ border: '1px solid #345363', borderRadius: 9, padding: 14 }} disabled={!settings.enabled}>
        <legend style={{ padding: '0 6px', fontWeight: 700 }}>Notify me for</legend>
        <label style={{ display: 'block', padding: '7px 0', cursor: 'pointer' }}><input type="radio" checked={settings.scope === 'ALL'} onChange={() => update({ scope: 'ALL' })}/> All NHL teams playing that day</label>
        <label style={{ display: 'block', padding: '7px 0', cursor: 'pointer' }}><input type="radio" checked={settings.scope === 'WAGERED'} onChange={() => update({ scope: 'WAGERED' })}/> Only teams with pending wagers</label>
        <label style={{ display: 'block', padding: '12px 0 0', cursor: 'pointer' }}><input type="checkbox" checked={settings.lineupChanges} onChange={e => update({ lineupChanges: e.target.checked })}/> Notify me when confirmed lines change afterward</label>
      </fieldset>
      <div style={{ ...panel, padding: 14 }}>
        <strong>Telegram account linking</strong>
        <p style={{ ...faint, margin: '7px 0 10px' }}>The connection link and test message will become available after the Telegram bot and secure backend are configured. No secret bot credentials belong in the desktop app.</p>
        <button type="button" disabled style={{ ...button, opacity: .5, cursor: 'not-allowed' }}>Connect Telegram — coming in backend step</button>
        <button type="button" disabled style={{ ...button, opacity: .5, cursor: 'not-allowed', marginLeft: 8 }}>Send Test Notification</button>
      </div>
      <p style={{ ...faint, fontSize: 12, margin: 0 }}>Stored locally under {STORAGE_KEY}. These settings do not yet synchronize across devices or user accounts.</p>
    </>}
  </div>
}
