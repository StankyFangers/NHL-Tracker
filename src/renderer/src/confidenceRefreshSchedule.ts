export function easternRefreshWindow(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now),get=(key:string)=>parts.find(p=>p.type===key)?.value
 const date=`${get('year')}-${get('month')}-${get('day')}`;return{date,slot:Number(get('hour'))>=14?'PM':'AM'}
}
export function confidenceRefreshDue(date:string,checkedAt?:string,now=new Date()){
 const current=easternRefreshWindow(now);if(date!==current.date)return false
 if(!checkedAt||!Number.isFinite(Date.parse(checkedAt)))return true
 const checked=easternRefreshWindow(new Date(checkedAt));return checked.date!==date||checked.slot!==current.slot
}
