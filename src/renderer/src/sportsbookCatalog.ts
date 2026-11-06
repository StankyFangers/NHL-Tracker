// Account-scoped, device-local sportsbook catalog. No wagers or balances are deleted.
export const BUILT_IN_SPORTSBOOKS=['Kalshi','Fanatics','Bet365','DraftKings','FanDuel','PrizePicks','Underdog'] as const
const activeKey='nhl:activeSportsbookAccount:v1'
const storageKey=(account:string)=>'nhl:customSportsbooks:v1:'+encodeURIComponent(account.toLowerCase())
const normalize=(name:string)=>name.trim().replace(/\s+/g,' ')
export function getCurrentSportsbookAccount(){return localStorage.getItem(activeKey)||''}
export function setCurrentSportsbookAccount(account:string){if(getCurrentSportsbookAccount()!==account){localStorage.setItem(activeKey,account);window.dispatchEvent(new Event('nhl-sportsbook-catalog-changed'))}}
export function customSportsbooks(account:string):string[]{
 try{
  const data:unknown=JSON.parse(localStorage.getItem(storageKey(account))||'[]')
  return Array.isArray(data)?data.filter((x):x is string=>typeof x==='string'&&x.length>0&&x.length<=60):[]
 }catch{return[]}
}
export function getSportsbooks(account=getCurrentSportsbookAccount()):string[]{
 return [...new Map([...BUILT_IN_SPORTSBOOKS,...customSportsbooks(account)].map(book=>[book.toLowerCase(),book])).values()]
}
export function canonicalSportsbook(name:string,account=getCurrentSportsbookAccount()){
 return getSportsbooks(account).find(book=>book.toLowerCase()===normalize(name).toLowerCase())
}
export function addSportsbook(account:string,raw:string){
 const name=normalize(raw)
 if(name.length<2||name.length>50||!/[A-Za-z0-9]/.test(name)||/[^\p{L}\p{N} .&'()+-]/u.test(name))throw Error('Enter a sportsbook name (2–50 letters/characters).')
 const existing=canonicalSportsbook(name,account)
 if(existing)throw Error(existing+' is already in your sportsbook list.')
 const list=[...customSportsbooks(account),name]
 if(list.length>100)throw Error('Maximum 100 custom sportsbooks per account.')
 localStorage.setItem(storageKey(account),JSON.stringify(list))
 window.dispatchEvent(new Event('nhl-sportsbook-catalog-changed'))
 window.dispatchEvent(new Event('nhl-sportsbook-visibility-changed'))
 window.dispatchEvent(new Event('nhl-betting-defaults'))
 return name
}
export function removeCustomSportsbook(account:string,name:string){
 const list=customSportsbooks(account)
 if(!list.includes(name))return false
 localStorage.setItem(storageKey(account),JSON.stringify(list.filter(n=>n!==name)))
 window.dispatchEvent(new Event('nhl-sportsbook-catalog-changed'))
 window.dispatchEvent(new Event('nhl-sportsbook-visibility-changed'))
 window.dispatchEvent(new Event('nhl-betting-defaults'))
 return true
}


export type SportsbookPricingFormat='AMERICAN'|'DECIMAL'|'PAYOUT'|'FRACTIONAL'
export const PRICING_OPTIONS:ReadonlyArray<{value:SportsbookPricingFormat;label:string;example:string}>=[
 {value:'AMERICAN',label:'American Odds',example:'-150 or +250'},
 {value:'DECIMAL',label:'Decimal Odds',example:'1.67 or 3.50'},
 {value:'PAYOUT',label:'Payout',example:'Total return in $'},
 {value:'FRACTIONAL',label:'Fractional Odds',example:'2/3 or 5/2'}
]
const pricingKey=(account:string)=>'nhl:sportsbookPricing:v1:'+encodeURIComponent(account.toLowerCase())
export function sportsbookPricing(book:string,account=getCurrentSportsbookAccount()):SportsbookPricingFormat{
 try{
  const raw=JSON.parse(localStorage.getItem(pricingKey(account))||'{}')
  const value=raw?.[book.trim().toLowerCase()]
  if(PRICING_OPTIONS.some(option=>option.value===value))return value
 }catch{}
 return book.trim().toLowerCase()==='kalshi'?'PAYOUT':'AMERICAN'
}
export function setSportsbookPricing(account:string,book:string,format:SportsbookPricingFormat){
 if(!canonicalSportsbook(book,account))throw Error('Select a known sportsbook.')
 if(!PRICING_OPTIONS.some(option=>option.value===format))throw Error('Unsupported pricing format.')
 let saved:Record<string,string>={}
 try{const value=JSON.parse(localStorage.getItem(pricingKey(account))||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value}catch{}
 saved[book.trim().toLowerCase()]=format
 localStorage.setItem(pricingKey(account),JSON.stringify(saved))
 window.dispatchEvent(new Event('nhl-sportsbook-pricing-changed'))
 window.dispatchEvent(new Event('nhl-betting-defaults'))
}
export function priceLabel(format:SportsbookPricingFormat){
 return PRICING_OPTIONS.find(option=>option.value===format)?.label||'American Odds'
}
export function parseSportsbookPrice(raw:string,format:SportsbookPricingFormat,stake:number):{odds:number;payout?:number}{
 if(!Number.isFinite(stake)||stake<=0)throw Error('Set a positive stake before entering a price.')
 const value=raw.trim()
 let decimal:number
 let payout:number|undefined
 if(format==='PAYOUT'){
  payout=Number(value)
  if(!value||!Number.isFinite(payout)||payout<=stake)throw Error('Enter a total payout greater than the stake.')
  decimal=payout/stake
 }else if(format==='FRACTIONAL'){
  const match=value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if(!match||Number(match[2])<=0)throw Error('Use fractional odds such as 2/3 or 5/2.')
  decimal=1+Number(match[1])/Number(match[2])
 }else if(format==='DECIMAL'){
  decimal=Number(value)
  if(!value||!Number.isFinite(decimal)||decimal<=1)throw Error('Decimal odds must be greater than 1.00.')
 }else{
  const american=Number(value)
  if(!value||!Number.isInteger(american)||Math.abs(american)<100)throw Error('American odds must be +100 or greater, or -100 or lower.')
  decimal=american>0?1+american/100:1+100/Math.abs(american)
 }
 if(!Number.isFinite(decimal)||decimal<=1)throw Error('Invalid sportsbook price.')
 const profitRatio=decimal-1
 const odds=profitRatio>=1?Math.round(profitRatio*100):-Math.round(100/profitRatio)
 if(!Number.isFinite(odds)||Math.abs(odds)<100)throw Error('Unable to convert price to American odds.')
 return {odds,payout}
}
