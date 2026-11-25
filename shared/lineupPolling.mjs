export function hourET(d){return Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',hourCycle:'h23'}).format(d))}
export function pollingInterval(ms){return ms<=0||ms>9*3600000?Infinity:ms<=15*60000?60000:ms<=3600000?300000:ms<=4*3600000?900000:ms<=7*3600000?1800000:3600000}
