'use strict'
// Offline only. Never connects to a database or sends the password anywhere.
// Run in a real terminal: node scripts/bootstrap-dev-admin.cjs
const {randomBytes,scrypt} = require('node:crypto')
const readline = require('node:readline')
const rl = readline.createInterface({input:process.stdin,output:process.stdout,terminal:true})
function ask(prompt, hidden=false) {
 return new Promise(resolve=>{
  if (!hidden) return rl.question(prompt,resolve)
  const original=rl._writeToOutput
  rl._writeToOutput=function(text){if(text.includes(prompt))return original.call(rl,text);if(text.includes('\n')||text.includes('\r'))return original.call(rl,'\n');return original.call(rl,'*')}
  rl.question(prompt,answer=>{rl._writeToOutput=original;resolve(answer)})
 })
}
;(async()=>{
 const email=(await ask('Your DEV account email: ')).trim().toLowerCase()
 if(!/^[^\s@']+@[^\s@']+\.[^\s@']+$/.test(email)||email.length>254)throw Error('Invalid email')
 const password=await ask('Choose password (12–128 characters; hidden): ',true)
 if(password.length<12||password.length>128)throw Error('Password length must be 12–128')
 const confirm=await ask('Confirm password (hidden): ',true)
 if(password!==confirm)throw Error('Passwords do not match')
 const salt=randomBytes(16).toString('hex')
 const hash=await new Promise((resolve,reject)=>scrypt(password,salt,64,(err,key)=>err?reject(err):resolve(key.toString('hex'))))
 const escaped=email.replace(/'/g,"''")
 console.log('\nCOPY ONLY THIS SQL into Neon DEV SQL Editor (neondb / development):\n')
 console.log(`INSERT INTO public.nhl_dev_accounts(username,email,password_hash,role)\nVALUES ('stankyfangers','${escaped}','scrypt:${salt}:${hash}','DEV');`)
 console.log('\nNever share the SQL, hash, or your password in chat. Clear SQL editor history if possible.')
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>rl.close())
