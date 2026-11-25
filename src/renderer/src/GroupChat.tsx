import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import type {Bet} from './App'
import './groupChat.css'

type Message={id:string;username:string;body:string;created_at:string}
type Request={head?:boolean;after?:string;body?:string;nonce?:string}
type Result={latest?:string|null;messages?:Message[];error?:string;sent?:boolean}
const request=(payload:Request):Promise<Result>=>(window.nhlTracker as any).liveChat(payload)
const stamp=new Intl.DateTimeFormat(undefined,{dateStyle:'short',timeStyle:'short'})
function betText(b:Bet){
 const legs=b.legs.map(l=>[l.team,l.player,l.side==='UNDER'?'Under':'',l.qty,l.stat].filter(v=>v!==''&&v!=null).join(' ')).join(' + ')
 return [b.date,legs,b.units+'u',b.odds==null?'':(b.odds>0?'+':'')+b.odds,b.book].filter(Boolean).join(' · ')
}

export function GroupChat({username,bets,date}:{username:string;bets:Bet[];date:string}){
 const key='nhlTracker:groupChat:read:'+username
 const [read,setRead]=useState(()=>Number(localStorage.getItem(key))||0)
 const [latest,setLatest]=useState(0),[open,setOpen]=useState(false)
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState('')
 const [error,setError]=useState(''),[sendError,setSendError]=useState(''),[sending,setSending]=useState(false)
 const [refresh,setRefresh]=useState(0),[sharing,setSharing]=useState(false)
 const [pos,setPos]=useState({x:Math.max(0,window.innerWidth-424),y:90})
 const panel=useRef<HTMLElement>(null),log=useRef<HTMLDivElement>(null)
 const cursor=useRef('0'),follow=useRef(true),pending=useRef({text:'',nonce:''})
 const drag=useRef<{dx:number;dy:number}|null>(null)
 function bounded(x:number,y:number){
  return {x:Math.max(0,Math.min(x,window.innerWidth-(panel.current?.offsetWidth??400))),y:Math.max(0,Math.min(y,window.innerHeight-(panel.current?.offsetHeight??380)))}
 }
 useEffect(()=>{
  if(!open)return
  const resize=()=>setPos(p=>bounded(p.x,p.y))
  resize();window.addEventListener('resize',resize)
  return ()=>window.removeEventListener('resize',resize)
 },[open])
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>
  async function poll(){
   try{
    const data=await request(open?{after:cursor.current}:{head:true})
    if(stopped)return
    if(data.error)throw Error(data.error)
    if(open){
     const rows=data.messages||[]
     if(rows.length){
      cursor.current=rows[rows.length-1].id
      setMessages(old=>[...old,...rows].slice(-1000))
      const others=rows.filter(m=>m.username!==username)
      if(others.length)setLatest(Number(others[others.length-1].id))
     }
    }else setLatest(Number(data.latest)||0)
    setError('')
   }catch(e){if(!stopped)setError(String(e instanceof Error?e.message:e))}
   if(!stopped)timer=setTimeout(poll,open?5000:30000)
  }
  void poll()
  return ()=>{stopped=true;clearTimeout(timer)}
 },[open,refresh,username])
 function markRead(){
  if(!open||!document.hasFocus()||!follow.current||!messages.length)return
  const seen=Number(messages[messages.length-1].id)
  if(seen>read){localStorage.setItem(key,String(seen));setRead(seen)}
 }
 useEffect(()=>{
  if(!open)return
  if(follow.current&&log.current)log.current.scrollTop=log.current.scrollHeight
  markRead();window.addEventListener('focus',markRead)
  return ()=>window.removeEventListener('focus',markRead)
 },[open,messages,read])
 async function send(){
  const text=draft.trim()
  if(!text||sending)return
  if(pending.current.text!==text)pending.current={text,nonce:crypto.randomUUID()}
  setSending(true);setSendError('')
  try{
   const result=await request({body:text,nonce:pending.current.nonce})
   if(!result.sent)throw Error(result.error||'Chat message could not be sent')
   pending.current={text:'',nonce:''};setDraft('');follow.current=true;setRefresh(x=>x+1)
  }catch(e){setSendError(String(e instanceof Error?e.message:e))}
  finally{setSending(false)}
 }
 return <>
  <button type="button" aria-expanded={open} onClick={()=>{follow.current=true;setOpen(!open)}}>CHAT {latest>read&&<span className="groupChatUnread" aria-label="Unread chat" title="Unread chat">●</span>}</button>
  {open&&createPortal(<section ref={panel} className="groupChatPanel" role="dialog" aria-label="Group chat" style={{left:pos.x,top:pos.y}}>
   <header><strong onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={dx:e.clientX-pos.x,dy:e.clientY-pos.y}}}
    onPointerMove={e=>{if(drag.current)setPos(bounded(e.clientX-drag.current.dx,e.clientY-drag.current.dy))}}
    onLostPointerCapture={()=>{drag.current=null}}>Group chat</strong><button aria-label="Close chat" onClick={()=>setOpen(false)}>×</button></header>
   <div ref={log} className="groupChatLog" onScroll={()=>{const el=log.current;if(el){follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<20;markRead()}}}>
    {messages.map(m=><article key={m.id}><b>{m.username}</b> <time dateTime={m.created_at}>{stamp.format(new Date(m.created_at))}</time><p>{m.body}</p></article>)}
   </div>
   {(sendError||error)&&<small role="alert">{sendError||error}</small>}
   {sharing&&<select aria-label="Choose a bet to share" value="" onChange={e=>{const b=bets.find(b=>b.id===e.target.value);if(b)setDraft(old=>[old,betText(b)].filter(Boolean).join('\n').slice(0,2000));setSharing(false)}}>
    <option value="">Choose a bet for {date}</option>{bets.filter(b=>b.date===date).map(b=><option key={b.id} value={b.id}>{betText(b)}</option>)}
   </select>}
   <textarea aria-label="Chat message" placeholder="Message the group…" rows={2} maxLength={2000} disabled={sending} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
   <footer><button disabled={sending} onClick={()=>setSharing(!sharing)}>Share bet</button><button disabled={sending||!draft.trim()} onClick={()=>void send()}>Send</button></footer>
  </section>,document.body)}
 </>
}
