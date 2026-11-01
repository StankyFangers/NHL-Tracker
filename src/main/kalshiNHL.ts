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
const hockey=(s:string)=>/\bNHL\b|hockey|ice hockey|KXNHL|KXNHLPTS|KXNHLAST|KXNHLGOALS/i.test(s)
const rawTicker=(f:any)=>String(f.ticker||f.market_ticker||'')
const obviousSport=(ticker:string,title:string)=>{
 const t=ticker.toUpperCase(),x=title.toLowerCase()
 if(/^KXNHL[A-Z0-9]*-/.test(t)||/\bnhl\b|ice hockey/.test(x))return 'NHL'
 if(/^KXUFC[A-Z0-9]*-/.test(t)||/\bufc\b|mixed martial arts/.test(x))return 'UFC'
 if(/^KXNBA[A-Z0-9]*-/.test(t)||/\bnba\b/.test(x))return 'NBA'
 if(/^KXNFL[A-Z0-9]*-/.test(t)||/\bnfl\b/.test(x))return 'NFL'
 if(/^KXMLB[A-Z0-9]*-/.test(t)||/\bmlb\b/.test(x))return 'MLB'
 if(/^KXBTC[A-Z0-9]*-/.test(t)||/\bbitcoin\b/.test(x))return 'CRYPTO'
 return 'UNKNOWN'
}

const isNhlTicker=(ticker:string)=>/^KXNHL(?:[A-Z0-9]*)(?:-|$)/i.test(ticker)
const parentLegDescriptions=(m:any,expected:number)=>{
 const title=[m?.title,m?.subtitle,m?.yes_sub_title].filter(Boolean).join(' | ')
 // Kalshi often renders "yes PLAYER: 1+ yes PLAYER: 1+" in the combo title.
 // These are shown for diagnosis only and never treated as verified per-leg markets.
 const snippets=[...title.matchAll(/\byes\s+([^|]+?:\s*\d+\+)(?=\s+yes\s+|\s*\||$)/gi)].map(x=>x[1].trim())
 return snippets.length===expected?snippets:[]
}
const asLegs=(m:any):any[]=>Array.isArray(m?.mve_selected_legs)?m.mve_selected_legs:[]
const metaCache=new Map<string,any>()
async function market(ticker:string):Promise<any>{
 if(metaCache.has(ticker))return metaCache.get(ticker)
 try{
  const r=await request('/markets/'+encodeURIComponent(ticker))
  const result=r.market||null
  metaCache.set(ticker,result)
  return result
 }catch{metaCache.set(ticker,null);return null}
}
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
 const uniqueTickers=[...new Set(all.map(rawTicker).filter(Boolean))]
 // Include ALL filled tickers, not an arbitrary first 400; else later fills are falsely "unclassified".
 // API retrieval is serial and cached across scans so repeat historical scans are cheaper.
 let lookups=0,unresolved=0
 for(const ticker of uniqueTickers){
  if(metaCache.has(ticker))continue
  if(lookups>=1200){unresolved++;continue}
  await market(ticker);lookups++
 }
 // Fetch each component market's readable title rather than searching JSON strings
 // containing only underlying market identifiers.
 const parentLegTickers=[...new Set(uniqueTickers.flatMap(t=>asLegs(metaCache.get(t)).map(l=>String(l.market_ticker||'')).filter(Boolean)))]
 let legLookups=0
 for(const ticker of parentLegTickers){
  if(metaCache.has(ticker))continue
  if(legLookups>=1200)break
  await market(ticker);legLookups++
 }
 const rows=all.map((f:any)=>{
  const ticker=rawTicker(f),m=metaCache.get(ticker)||{}
  const parentTitles=parentLegDescriptions(m,asLegs(m).length)
  const legs=asLegs(m).map((l:any,index:number)=>{
   const lt=String(l.market_ticker||'')
   const lm=metaCache.get(lt)||{}
   const metadataTitle=[lm.title,lm.subtitle,lm.yes_sub_title].filter(Boolean).join(' | ')
   const fallback=parentTitles[index]||''
   return {ticker:lt,side:String(l.side||''),title:metadataTitle||fallback||lt,resolved:!!lm.title,source:metadataTitle?'MARKET_METADATA':fallback?'PARENT_TITLE':'TICKER_ONLY',nhlTicker:isNhlTicker(lt)}
  })
  const description=[m.title,m.subtitle,m.yes_sub_title].filter(Boolean).join(' | ')
  const classificationText=[ticker,description,...legs.flatMap(l=>[l.ticker,l.title])].join(' ')
  const anyNhl=hockey(classificationText)
  const everyLegNhl=legs.length>0&&legs.every(l=>l.nhlTicker || (l.resolved&&hockey(l.title)))
  const allLegsResolved=legs.length>0&&legs.every(l=>l.resolved)
  const isNhl=legs.length>0?everyLegNhl:anyNhl
  const classification=legs.length>0?(everyLegNhl?(allLegsResolved?'NHL_COMBO_VERIFIED':'NHL_COMBO_TICKERS_CONFIRMED') :!allLegsResolved?'UNRESOLVED_COMBO':anyNhl?'MIXED_OR_UNVERIFIED_COMBO':'OTHER_COMBO'):(isNhl?'NHL_SINGLE':'UNCLASSIFIED')
  const fillId=String(f.fill_id||f.trade_id||'')
  const orderId=String(f.order_id||'')
  // Never invent an external ID from date and ticker; the import engine must require a real ID.
  const id=fillId||[orderId,ticker,dateOf(f),String(f.count_fp??f.count??'')].join('|')
  const hasLegs=legs.length>0
  const sportSignals=legs.map(l=>obviousSport(l.ticker,l.source==='MARKET_METADATA'?l.title:''))
  const detectedSport=legs.length>0
   ?(sportSignals.every(x=>x!=='UNKNOWN'&&x===sportSignals[0])?sportSignals[0]:sportSignals.some(x=>x==='UNKNOWN')?'UNRESOLVED':'MIXED')
   :obviousSport(ticker,description)
  const review=classification
  return {detectedSport,id,fillId,orderId,date:dateOf(f).slice(0,10),createdAt:dateOf(f),ticker,title:description||ticker,side:String(f.side||''),action:String(f.action||''),count:String(f.count_fp??f.count??''),price:String(f.yes_price_dollars??f.no_price_dollars??f.yes_price??f.no_price??''),fee:String(f.fee_cost_dollars??f.fee_cost??''),isNhl,review,legs}
 })
 const nhl=rows.filter(r=>r.isNhl),unknown=rows.filter(r=>!r.isNhl)
 const buckets={unresolved:unknown.filter(r=>r.detectedSport==='UNRESOLVED'||r.detectedSport==='UNKNOWN'),mixed:unknown.filter(r=>r.detectedSport==='MIXED'),otherSports:unknown.filter(r=>!['UNRESOLVED','UNKNOWN','MIXED'].includes(r.detectedSport))}

 // Only a candidate if *every* leg is NHL; mixed-sport parlays must never be silently imported.
 const mixedLegs=rows.filter(r=>r.review==='MIXED_OR_UNVERIFIED_COMBO').length
 const unresolvedCombos=rows.filter(r=>r.review==='UNRESOLVED_COMBO').length
 const otherCombos=rows.filter(r=>r.review==='OTHER_COMBO').length
 const distinctOrders=new Set(nhl.map(r=>r.orderId).filter(Boolean))
 // A single order may contain multiple fills. Only order-level grouping is proposed for review.
 const combos=nhl.filter(r=>r.legs.length>=2)
 const comboTickerFallbacks=nhl.filter(r=>r.review==='NHL_COMBO_TICKERS_CONFIRMED').length
 return {totalFills:all.length,nhl,unknown:unknown.slice(0,500),unclassified:unknown.length,categoryCounts:{unresolved:buckets.unresolved.length,mixed:buckets.mixed.length,otherSports:buckets.otherSports.length},pages,complete,marketLookups:lookups,legLookups,unresolved:Math.max(unresolved,uniqueTickers.filter(t=>!metaCache.has(t)).length),distinctNhlOrders:distinctOrders.size,combos:combos.length,comboTickerFallbacks,mixedLegs,unresolvedCombos,otherCombos,notice:'Read-only: '+nhl.length+' NHL-related fills, '+combos.length+' with multiple documented component legs, '+unknown.length+' review-required/other fills ('+mixedLegs+' mixed, '+unresolvedCombos+' unresolved combos). No wagers imported.'}
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
 ipcMain.handle('kalshi:sync-today',async(_e,date:string)=>{
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))throw Error('Invalid sync date')
  // Include the previous UTC calendar day so late-night games and after-midnight
  // purchases can be resolved against the actual NHL slate.
  const previous=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10)
  const result=await scan(previous,30)
  if(!result.complete)throw Error('Incomplete Kalshi scan: import blocked to prevent partial order totals')
  return {...result,nhl:result.nhl.filter(x=>x.date===date||x.date===previous),unknown:[],notice:'Today and overnight fills scanned; resolve against each NHL game date before importing.'}
 })
 ipcMain.handle('kalshi:sync-preview',async()=>{
  // Deliberately preview-only until fill -> wager grouping / settlements are verified.
  return scan('2026-10-01',10)
 })
}
