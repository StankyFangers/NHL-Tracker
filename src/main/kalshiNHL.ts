import {app,ipcMain,dialog,safeStorage} from 'electron'
import {readFile,writeFile,unlink,mkdir} from 'fs/promises'
import {join,dirname} from 'path'
import {createPrivateKey,sign,constants} from 'crypto'

const BASE='https://external-api.kalshi.com/trade-api/v2'
type Credential={id:string,pem:string}
let cached:Credential|null=null
const savedPath=()=>join(app.getPath('userData'),'kalshi-readonly.enc')
const keySafe=()=>safeStorage.isEncryptionAvailable()
async function stored():Promise<Credential>{
 if(!keySafe())throw Error('Windows key encryption is unavailable')
 const raw=await readFile(savedPath())
 const credential=JSON.parse(safeStorage.decryptString(raw))
 if(!credential?.id||!credential?.pem)throw Error('Invalid stored Kalshi credentials')
 return credential
}
async function request(path:string,params?:URLSearchParams){
 const creds=cached||await stored()
 const key=createPrivateKey(creds.pem)
 const ms=String(Date.now())
 const signed=Buffer.from(ms+'GET'+'/trade-api/v2'+path,'utf8')
 const signature=key.asymmetricKeyType==='ed25519'
  ?sign(null,signed,key)
  :sign('sha256',signed,{key,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32})
 const url=BASE+path+(params?.size?'?'+params.toString():'')
 const resp=await fetch(url,{headers:{'KALSHI-ACCESS-KEY':creds.id,'KALSHI-ACCESS-TIMESTAMP':ms,'KALSHI-ACCESS-SIGNATURE':signature.toString('base64'),'Accept':'application/json'},signal:AbortSignal.timeout(30000)})
 if(!resp.ok)throw Error('Kalshi HTTP '+resp.status+' — '+(await resp.text()).slice(0,140))
 return resp.json() as Promise<any>
}
const dateOf=(f:any)=>String(f.created_time||f.ts||f.created_at||f.timestamp||'')
const hockey=(s:string)=>/NHL|hockey|ice hockey|\b(McDavid|MacKinnon|Matthews|Kucherov)\b/i.test(s)
async function scan(from:string,limitPages:number){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(from))throw Error('Invalid historical date')
 const start=Date.parse(from+'T00:00:00Z')
 if(!Number.isFinite(start))throw Error('Invalid historical date')
 const all:any[]=[]
 const seen=new Set<string>()
 let cursor='',complete=false,pages=0
 for(let i=0;i<limitPages;i++){
  const q=new URLSearchParams({limit:'200',min_ts:String(Math.floor(start/1000))})
  if(cursor)q.set('cursor',cursor)
  const response=await request('/portfolio/fills',q)
  all.push(...(Array.isArray(response.fills)?response.fills:[]))
  pages++
  cursor=String(response.cursor||'')
  if(!cursor){complete=true;break}
  if(seen.has(cursor))throw Error('Repeated cursor returned by Kalshi');seen.add(cursor)
 }
 const grouped=new Map<string,any[]>()
 for(const f of all){const ticker=String(f.ticker||f.market_ticker||'');if(!grouped.has(ticker))grouped.set(ticker,[]);grouped.get(ticker)!.push(f)}
 const marketMeta=new Map<string,string>()
 // Limit lookups; never import unidentified legs.
 const tickers=[...grouped.keys()].filter(Boolean)
 for(let i=0;i<tickers.length&&i<400;i++){
  const ticker=tickers[i]
  try{
   const r=await request('/markets/'+encodeURIComponent(ticker))
   const m=r.market||{}
   const legs=Array.isArray(m.mve_selected_legs)?m.mve_selected_legs.map((x:any)=>JSON.stringify(x)).join(' | '):''
   marketMeta.set(ticker,[m.title,m.subtitle,m.yes_sub_title,legs].filter(Boolean).join(' | ').slice(0,900))
  }catch{marketMeta.set(ticker,'')}
 }
 const rows=all.map((f:any)=>{
  const ticker=String(f.ticker||f.market_ticker||'')
  const description=marketMeta.get(ticker)||''
  const id=String(f.fill_id||f.trade_id||f.order_id||ticker+'-'+dateOf(f))
  return {id,date:dateOf(f).slice(0,10),ticker,title:description||ticker,side:String(f.side||''),action:String(f.action||''),count:String(f.count_fp??f.count??''),price:String(f.yes_price_dollars??f.no_price_dollars??f.yes_price??f.no_price??''),fee:String(f.fee_cost_dollars??f.fee_cost??''),isNhl:hockey(description+' '+ticker)}
 })
 const nhl=rows.filter(r=>r.isNhl),unknown=rows.filter(r=>!r.isNhl)
 return {totalFills:all.length,nhl,unknown:unknown.slice(0,300),unclassified:unknown.length,pages,complete,marketLookups:Math.min(tickers.length,400),notice:'Read-only scan: '+nhl.length+' likely NHL fills; '+unknown.length+' other/unclassified. No wagers were imported.'}
}
export function registerKalshiNHL(){
 ipcMain.handle('kalshi:settings',async()=>{
  if(!keySafe())return {configured:false,error:'Secure Windows encryption unavailable'}
  try{const c=await stored();return {configured:true,keyId:c.id}}catch(e:any){return {configured:false,error:e?.code==='ENOENT'?'':String(e?.message||e)}}
 })
 ipcMain.handle('kalshi:choose-pem',async()=>{
  const r=await dialog.showOpenDialog({title:'Select Kalshi private key',properties:['openFile'],filters:[{name:'PEM private key',extensions:['pem','key']}]})
  return {cancelled:r.canceled,path:r.filePaths[0]||''}
 })
 ipcMain.handle('kalshi:save',async(_e,id:string,pemPath:string)=>{
  if(!keySafe())throw Error('Secure Windows encryption unavailable')
  if(typeof id!=='string'||id.length<6||id.length>300||typeof pemPath!=='string'||pemPath.length>2048)throw Error('Invalid key ID or PEM file')
  const pem=await readFile(pemPath,'utf8')
  if(pem.length>20000)throw Error('Private key file too large')
  const key=createPrivateKey(pem)
  if(!['ed25519','rsa'].includes(key.asymmetricKeyType||''))throw Error('Expected Ed25519 or RSA private key')
  const candidate={id:id.trim(),pem}
  // Validate before saving, using only a GET request.
  const old=cached;cached=candidate
  try{await request('/portfolio/balance')}catch(e){cached=old;throw e}
  await mkdir(dirname(savedPath()),{recursive:true})
  await writeFile(savedPath(),safeStorage.encryptString(JSON.stringify(candidate)),{mode:0o600})
  cached=null
  return {ok:true}
 })
 ipcMain.handle('kalshi:disconnect',async()=>{
  cached=null
  try{await unlink(savedPath())}catch(e:any){if(e?.code!=='ENOENT')throw e}
  return {ok:true}
 })
 ipcMain.handle('kalshi:check',async()=>{await request('/portfolio/balance');return {ok:true}})
 ipcMain.handle('kalshi:history',async(_e,from:string)=>scan(from,30))
 ipcMain.handle('kalshi:sync-preview',async()=>{
  // Deliberately preview-only until fill -> wager grouping / settlements are verified.
  return scan('2026-10-01',10)
 })
}
