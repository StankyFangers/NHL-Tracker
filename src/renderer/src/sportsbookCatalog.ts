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
