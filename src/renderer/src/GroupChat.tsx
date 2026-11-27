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

function chatChime(){
 if(localStorage.getItem('soundMaster')==='false')return
 const volume=Number(localStorage.getItem('soundVolume')??'.35')
 if(!(volume>0))return
 try{
  const ctx=new AudioContext()
  if(ctx.state!=='running'){void ctx.close();return}
  const tone=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime
  tone.frequency.value=660
  gain.gain.setValueAtTime(0.0001,now)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,0.09*Math.min(1,volume)),now+0.018)
  gain.gain.exponentialRampToValueAtTime(0.0001,now+0.24)
  tone.connect(gain);gain.connect(ctx.destination)
  tone.onended=()=>{void ctx.close()}
  tone.start(now);tone.stop(now+0.25)
 }catch{/* Chat polling also works on devices without audio. */}
}

type PanelRect={x:number;y:number;width:number;height:number}
function fitPanel(rect:PanelRect){
 const width=Math.min(window.innerWidth,Math.max(280,rect.width))
 const height=Math.min(window.innerHeight,Math.max(250,rect.height))
 return {width,height,x:Math.max(0,Math.min(rect.x,window.innerWidth-width)),y:Math.max(0,Math.min(rect.y,window.innerHeight-height))}
}
function resizePanel(start:PanelRect,left:boolean,dx:number,dy:number){
 const right=start.x+start.width
 const width=Math.min(left?right:window.innerWidth-start.x,Math.max(280,start.width+(left?-dx:dx)))
 const height=Math.min(window.innerHeight-start.y,Math.max(250,start.height+dy))
 return fitPanel({x:left?right-width:start.x,y:start.y,width,height})
}

export function GroupChat({username,bets,date,preview=false}:{username:string;bets:Bet[];date:string;preview?:boolean}){
 const key='nhlTracker:groupChat:read:'+username
 const [read,setRead]=useState(()=>Number(localStorage.getItem(key))||0)
 const [latest,setLatest]=useState(0),[open,setOpen]=useState(false)
 const [messages,setMessages]=useState<Message[]>([]),[draft,setDraft]=useState('')
 const [error,setError]=useState(''),[sendError,setSendError]=useState(''),[sending,setSending]=useState(false)
 const [refresh,setRefresh]=useState(0),[sharing,setSharing]=useState(false)
 const [pos,setPos]=useState(()=>fitPanel({x:window.innerWidth-424,y:90,width:400,height:390}))
 const log=useRef<HTMLDivElement>(null)
 const lastIncoming=useRef<number|null>(null)
 const cursor=useRef('0'),follow=useRef(true),pending=useRef({text:'',nonce:''})
 const drag=useRef<{dx:number;dy:number}|null>(null)
 const resizing=useRef<{rect:PanelRect;startX:number;startY:number}|null>(null)
 useEffect(()=>{
  if(!open)return
  const resize=()=>setPos(fitPanel)
  resize();window.addEventListener('resize',resize)
  return ()=>window.removeEventListener('resize',resize)
 },[open])
 useEffect(()=>{
  if(preview)return
  let stopped=false,timer:ReturnType<typeof setTimeout>
  async function poll(){
   try{
    const data=await request(open?{after:cursor.current}:{head:true})
    if(stopped)return
    if(data.error)throw Error(data.error)
    let incoming=0
    if(open){
     const rows=data.messages||[]
     if(rows.length){
      cursor.current=rows[rows.length-1].id
      setMessages(old=>[...old,...rows].slice(-1000))
      const others=rows.filter(m=>m.username!==username)
      if(others.length)incoming=Number(others[others.length-1].id)
     }
    }else incoming=Number(data.latest)||0
    const previous=lastIncoming.current
    if(previous!==null && incoming>previous)chatChime()
    lastIncoming.current=Math.max(previous??0,incoming)
    setLatest(lastIncoming.current)
    setError('')
   }catch(e){if(!stopped)setError(String(e instanceof Error?e.message:e))}
   if(!stopped)timer=setTimeout(poll,open?5000:30000)
  }
  void poll()
  return ()=>{stopped=true;clearTimeout(timer)}
 },[open,refresh,username,preview])
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
  if(preview||!text||sending)return
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
  <button type="button" className="nhl1815AllGamesButton groupChatToggle" aria-pressed={open} aria-expanded={open} onClick={()=>{follow.current=true;setOpen(!open)}}><span className="groupChatGlyph" aria-hidden="true"/>CHAT {latest>read&&<span className="groupChatUnread" aria-label="Unread chat" title="Unread chat">●</span>}</button>
  {open&&createPortal(<section className="groupChatPanel" role="dialog" aria-label="Group chat" style={{left:pos.x,top:pos.y,width:pos.width,height:pos.height}}>
   <header><strong onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={dx:e.clientX-pos.x,dy:e.clientY-pos.y}}}
    onPointerMove={e=>{if(drag.current)setPos(fitPanel({...pos,x:e.clientX-drag.current.dx,y:e.clientY-drag.current.dy}))}}
    onLostPointerCapture={()=>{drag.current=null}}>Group chat</strong><button aria-label="Close chat" onClick={()=>setOpen(false)}>×</button></header>
   <div ref={log} className="groupChatLog" onScroll={()=>{const el=log.current;if(el){follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<20;markRead()}}}>
    {messages.map(m=><article key={m.id}><b>{m.username}</b> <time dateTime={m.created_at}>{stamp.format(new Date(m.created_at))}</time><p>{m.body}</p></article>)}
   </div>
   {preview&&<small>TEST preview · Sending messages requires a LIVE session.</small>}
   {(sendError||error)&&<small role="alert">{sendError||error}</small>}
   {sharing&&<select aria-label="Choose a bet to share" value="" onChange={e=>{const b=bets.find(b=>b.id===e.target.value);if(b)setDraft(old=>[old,betText(b)].filter(Boolean).join('\n').slice(0,2000));setSharing(false)}}>
    <option value="">Choose a bet for {date}</option>{bets.filter(b=>b.date===date).map(b=><option key={b.id} value={b.id}>{betText(b)}</option>)}
   </select>}
   <textarea aria-label="Chat message" placeholder="Message the group…" rows={2} maxLength={2000} disabled={sending} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/>
   <footer><button disabled={sending} onClick={()=>setSharing(!sharing)}>Share bet</button><button disabled={preview||sending||!draft.trim()} onClick={()=>void send()}>Send</button></footer>
   {(['left','right'] as const).map(side=><span key={side} className={'groupChatGrip '+side} title={'Resize from bottom '+side}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);resizing.current={rect:pos,startX:e.clientX,startY:e.clientY}}}
    onPointerMove={e=>{const start=resizing.current;if(start&&e.currentTarget.hasPointerCapture(e.pointerId))setPos(resizePanel(start.rect,side==='left',e.clientX-start.startX,e.clientY-start.startY))}}
    onLostPointerCapture={()=>{resizing.current=null}}/>)}
  </section>,document.body)}
 </>
}
