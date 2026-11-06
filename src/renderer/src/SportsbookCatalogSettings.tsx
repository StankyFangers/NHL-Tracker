import {useEffect,useState} from 'react'
import {addSportsbook,customSportsbooks,getSportsbooks,removeCustomSportsbook,sportsbookPricing,setSportsbookPricing,PRICING_OPTIONS,type SportsbookPricingFormat} from './sportsbookCatalog'
import './sportsbookCatalog.css'

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
 return <section className="settingsCard bettingSettings sportsbook-catalog">
  <h2>Add Sportsbook</h2>
  <p>Add your preferred sportsbook or betting platform. Each signed-in account has its own sportsbook list on this computer. Existing wagers, balances, and transaction history are never rewritten.</p>
  <form onSubmit={add} className="sportsbook-catalog-form">
   <label className="sportsbook-catalog-name">SPORTSBOOK NAME<input value={name} onChange={e=>setName(e.target.value)} maxLength={50} placeholder="Enter a sportsbook name" required/></label>
   <button type="submit" className="sportsbook-action">+ Add Sportsbook</button>
  </form>
  {notice&&<p role="status">{notice}</p>}
  <h3>Your Sportsbooks ({books.length})</h3>
  <div className="sportsbook-catalog-list">
   {books.map(book=><div key={book} className="sportsbook-catalog-item">
    <strong>{book}</strong><label className="sportsbook-catalog-format">PRICING<select aria-label={book+' pricing format'} value={sportsbookPricing(book,account)} onChange={e=>{setSportsbookPricing(account,book,e.target.value as SportsbookPricingFormat);setNotice(book+' pricing format saved for new wagers.');setBooks([...getSportsbooks(account)])}}>{PRICING_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
    {customSportsbooks(account).includes(book)?<button type="button" className="sportsbook-action secondary" onClick={()=>remove(book)}>Remove from list</button>:<small>Included by default</small>}
   </div>)}
  </div>
  <button type="button" className="sportsbook-action" onClick={onOpenBalances}>Configure Sportsbook Balances</button>
 </section>
}
