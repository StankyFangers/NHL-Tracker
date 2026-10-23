export function officialGameDate(game:any):string{
 if(/^\d{4}-\d{2}-\d{2}$/.test(String(game?.gameDate||'')))return game.gameDate
 // NHL slates use the Eastern calendar, never UTC's next-day date.
 const time=Date.parse(game?.startTimeUTC||'');if(!Number.isFinite(time))return ''
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time))
 const get=(kind:string)=>parts.find(p=>p.type===kind)?.value
 return `${get('year')}-${get('month')}-${get('day')}`
}
