import type {CSSProperties} from 'react'
const section:CSSProperties={padding:'13px 16px',background:'#102935',border:'1px solid #2d5260',borderRadius:9,margin:'12px 0'}
const small:CSSProperties={fontSize:12,color:'#abc6d1'}
export function KalshiSyncGuide(){
 return <article className="settingsCard" style={{maxWidth:1050}}>
  <h2>Kalshi Sync Guide — Complete Windows Setup</h2>
  <p>Use these instructions once to connect your own Kalshi account to NHL Tracker. You do not need to send anyone your password, API Key ID or private key. Tracker reads your trades and history but does not place orders or move money.</p>
  <section style={section}><h3>Step 1 — Open the API key page on Kalshi</h3>
   <ol><li>On your Windows computer, open <a href="https://kalshi.com" target="_blank" rel="noreferrer">kalshi.com</a> in a web browser and sign in.</li>
   <li>Click your account/profile icon (usually in the top-right corner).</li>
   <li>Choose <b>Account &amp; security</b> (some versions call it Account Settings or Profile Settings).</li>
   <li>Find the section called <b>API keys</b> and click <b>Create key</b> or <b>Create New API Key</b>.</li></ol>
   <p>Shortcut: <a href="https://kalshi.com/account/profile" target="_blank" rel="noreferrer">Open Kalshi Account / Profile Settings</a>. If Kalshi changes its menu, use the profile menu to find API keys.</p>
  </section>
  <section style={section}><h3>Step 2 — Create a READ-ONLY key</h3>
   <ol><li>Give the key a recognizable nickname, for example <b>NHL Tracker Read Only</b>.</li>
   <li>Leave <b>Key type</b> as <b>Ed25519</b> (recommended); <b>RSA</b> also works in the tracker.</li>
   <li>Leave the optional <b>Public key</b> field empty. Kalshi generates the key pair for you.</li>
   <li>Under <b>Permissions</b>, keep <b>Read all data</b> checked. <b>Uncheck Full access</b> and do not enable Trade, Transfers or Accept block trades.</li>
   <li>Click <b>Create</b>. If Kalshi requests confirmation, review that the permissions are read-only.</li></ol>
   <p style={{color:'#f1c68e'}}><b>Important:</b> Do NOT select Full access. NHL Tracker only needs read permissions to inspect historical and daily fills.</p>
  </section>
  <section style={section}><h3>Step 3 — Save BOTH things Kalshi gives you</h3>
   <ol><li><b>API Key ID:</b> Copy the Key ID shown by Kalshi and temporarily put it in a private note. It is a text identifier, NOT the private key and NOT your Kalshi password.</li>
   <li><b>Private key file:</b> Kalshi downloads a file containing your private key. Keep the downloaded file; depending on Kalshi's interface it may end in <code>.txt</code>, <code>.pem</code>, or <code>.key</code>.</li>
   <li>Open Windows File Explorer → <b>Documents</b>. Create a folder called <b>NHL Tracker</b>, then a subfolder called <b>Kalshi</b>.</li>
   <li>Move the downloaded key file from <b>Downloads</b> into <b>Documents\NHL Tracker\Kalshi</b>. A helpful name is <code>kalshi-private-key.pem</code>, but you can keep Kalshi's original filename and extension. NHL Tracker accepts <code>.txt</code>, <code>.pem</code>, and <code>.key</code>.</li>
   <li>Do not change the file contents, erase any lines, or paste your Kalshi login details into it. The file should contain text beginning with <code>-----BEGIN PRIVATE KEY-----</code> or <code>-----BEGIN RSA PRIVATE KEY-----</code>, and the matching END line.</li></ol>
   <p style={small}>If Windows hides filename extensions, File Explorer → View → Show → File name extensions. Make sure you didn't accidentally name the file <code>kalshi-private-key.pem.txt</code> if you deliberately renamed it. Kalshi only displays/provides the private key once; if you lose it, create a new read-only key.</p>
  </section>
  <section style={section}><h3>Step 4 — Connect it to NHL Tracker</h3>
   <ol><li>Open NHL Tracker and log in to your account.</li>
   <li>Open <b>Settings → Kalshi Sync → Kalshi Sync Settings</b>.</li>
   <li>Paste the <b>API Key ID</b> into the field marked API Key ID.</li>
   <li>Click <b>Choose PEM</b> (the button name refers to the private-key format, even if the file ends in .txt).</li>
   <li>Browse to <b>Documents\NHL Tracker\Kalshi</b>, select the downloaded private key file, then click Open.</li>
   <li>Click <b>Save &amp; Test</b>. A successful connection displays <b>Connection saved</b>. You can also click <b>Test Saved Connection</b> afterward.</li></ol>
   <p>Tracker validates the credentials using a read-only Kalshi request and stores an encrypted copy on your Windows PC. The private key is not uploaded with your cloud wagers. You do not need to move the original file into the app's installation folder.</p>
  </section>
  <section style={section}><h3>Step 5 — Import your wagers</h3>
   <ol><li><b>Today's wagers:</b> Open <b>Bet Entry</b>, select today's NHL slate and choose <b>Sync Kalshi Bets</b>. Review the matched wagers, then choose Import All.</li>
   <li><b>Older wagers:</b> Open <b>Settings → Kalshi Sync → Kalshi Sync Historical Backfill</b>. Select the original <b>purchase date</b> range, Scan Historical Bets, review, then Import All.</li>
   <li>Wait for the account's <b>Cloud saved</b> confirmation after importing. Exact Kalshi order IDs prevent importing the same order twice; already-imported wagers will be skipped.</li>
   <li>Check <b>Sync Review</b> for wagers that cannot be safely matched to an NHL game/player. Do not manually force an unmatched leg to another game.</li></ol>
   <p style={small}>The scan finds and prepares wagers. It never places a Kalshi trade. Imported NHL wagers use the tracker's existing grading and verification; an import preview is not proof of a final Kalshi cash settlement.</p>
  </section>
  <section style={section}><h3>Having trouble? Find your error here</h3>
   <ul><li><b>Can't find API keys:</b> Use the desktop Kalshi website, not just the mobile app. Check Account &amp; security / Profile Settings.</li>
   <li><b>Can't find downloaded key:</b> Check Windows Downloads, your browser's recent downloads and File Explorer. If permanently lost, create a new read-only key on Kalshi.</li>
   <li><b>Can't select the .txt file:</b> In the file picker, select the file ending in .txt. NHL Tracker accepts it directly; no conversion is needed.</li>
   <li><b>Invalid key:</b> Check that you entered the Key ID from the same key creation as the downloaded private key, with no extra spaces.</li>
   <li><b>HTTP 401 / authentication failed:</b> Check permissions, make sure the key was not revoked, and try creating a fresh read-only pair.</li>
   <li><b>Private key file invalid:</b> Make sure the download wasn't replaced with copied website text. The file needs the complete BEGIN and END key lines.</li>
   <li><b>Connection saved but no wagers:</b> Check the purchase date, make sure the wager is an NHL market and look in Sync Review for exact skip reasons.</li>
   <li><b>New Windows computer:</b> The encrypted connection is device-specific. Securely move your original private key file to the new PC, or create a new read-only key, then Save &amp; Test there.</li></ul>
   <p style={{color:'#f1c68e'}}><b>Security:</b> Never post your Key ID, private key file, its contents or your password in a support chat, Discord or screenshot. Do not put the key file in a public GitHub repository or shared cloud folder. If the key is exposed, revoke it in Kalshi's API keys settings and create a new read-only key.</p>
  </section>
  <p style={small}>Kalshi's account menu labels may change. Official starting point: <a href="https://help.kalshi.com/en/articles/13823854-kalshi-api" target="_blank" rel="noreferrer">Kalshi API Help</a>.</p>
 </article>
}
