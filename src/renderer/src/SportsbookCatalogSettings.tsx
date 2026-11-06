import {useEffect,useState} from 'react'
import {addSportsbook,customSportsbooks,getSportsbooks,removeCustomSportsbook} from './sportsbookCatalog'

export default function SportsbookCatalogSettings({account,onOpenBalances}:{account:string;onOpenBalances:()=>void}){
 const [name,setName]=useState('')
 const [notice,setNotice]=useState('')
 const [books,setBooks]=useState<string[]>(()=>getSportsbooks(account))
 useEffect(()=>{
  const refresh=()=>setBooks(getSportsbooks(account))
  refresh()
  window.addEventListener('nhl-sportsbook-catalog-changed',refresh)
  return()=>window.removeEventListener('nhl-sportsbook-catalog-changed',refresh)
 },[account])
 const add=(e:React.FormEvent)=>{
  e.preventDefault()
  try{
   const added=addSportsbook(account,name)
   setName('')
   setNotice(added+' added. You can now select it when logging wagers and configuring balances.')
   setBooks(getSportsbooks(account))
  }catch(error){setNotice(String(error instanceof Error?error.message:error))}
 }
 const remove=(book:string)=>{
  if(!window.confirm('Remove '+book+' from your choices? Existing wagers and balances will NOT be deleted.'))return
  removeCustomSportsbook(account,book);setBooks(getSportsbooks(account));setNotice(book+' removed from selection lists. Existing data is unchanged.')
 }
 return <section className="settingsCard bettingSettings" style={{maxWidth:850,margin:'0 auto',padding:22}}>
  <h2>Add Sportsbook</h2>
  <p>Add your preferred sportsbook or betting platform. Each signed-in account has its own sportsbook list on this computer. Existing wagers, balances, and transaction history are never rewritten.</p>
  <form onSubmit={add} style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap',marginBottom:16}}>
   <label style={{display:'grid',gap:6,flex:1,minWidth:240}}>SPORTSBOOK NAME<input value={name} onChange={e=>setName(e.target.value)} maxLength={50} placeholder="Enter a sportsbook name" required/></label>
   <button type="submit" style={{padding:'10px 18px'}}>+ Add Sportsbook</button>
  </form>
  {notice&&<p role="status">{notice}</p>}
  <h3>Your Sportsbooks ({books.length})</h3>
  <div style={{display:'grid',gap:7}}>
   {books.map(book=><div key={book} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',border:'1px solid #365463',borderRadius:8}}>
    <strong style={{flex:1}}>{book}</strong>
    {customSportsbooks(account).includes(book)?<button type="button" onClick={()=>remove(book)}>Remove from list</button>:<small>Included by default</small>}
   </div>)}
  </div>
  <button type="button" onClick={onOpenBalances} style={{marginTop:16}}>Configure Sportsbook Balances</button>
 </section>
}
