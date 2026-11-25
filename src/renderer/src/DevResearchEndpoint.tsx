import {useState} from 'react'
import {API_KEY, researchUrl} from './comboResearchSync'

export function DevResearchEndpoint() {
 const [url, setUrl] = useState(researchUrl)
 const [message, setMessage] = useState('')

 function save() {
  const value = url.trim()
  if (value) {
   try {
    const endpoint = new URL(value)
    if (!['https:', 'http:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw Error()
   } catch {
    setMessage('Enter an HTTP or HTTPS URL without credentials.')
    return
   }
   localStorage.setItem(API_KEY, value)
  } else {
   localStorage.removeItem(API_KEY)
  }
  setUrl(researchUrl())
  setMessage('Research API URL saved on this device.')
 }

 return <section className="devCenterCard">
  <h2>Combo Research</h2>
  <label>Research API URL
   <input type="url" value={url} onChange={event=>{setUrl(event.target.value);setMessage('')}}/>
  </label>
  <p>Clear the field and save to restore the shared collector URL.</p>
  <button type="button" onClick={save}>SAVE URL</button>
  {message && <p className="devCenterMeta" role="status">{message}</p>}
 </section>
}
