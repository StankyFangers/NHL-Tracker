import {parseResearchImport, type ResearchCombo} from './comboResearchModel'

export const STORE = 'nhlTracker:research:preview:v1'
export const API_KEY = 'nhlTracker:research:apiUrl:v1'
export const RESEARCH_UPDATED = 'nhlTracker:research:updated'
const SYNC_TIME = 'nhlTracker:research:lastSuccessfulSync:v1'
export const lastResearchSync = () => localStorage.getItem(SYNC_TIME)
const defaultUrl = 'https://nhl-combo-research-dev.nhl-tracker.workers.dev'
export const researchUrl = () => localStorage.getItem(API_KEY)?.trim() || import.meta.env?.VITE_COMBO_RESEARCH_URL?.trim() || defaultUrl

export function readResearchHistory(): ResearchCombo[] {
 try { return JSON.parse(localStorage.getItem(STORE) || '[]') }
 catch { return [] }
}

async function downloadResearch(base: string) {
 const url = new URL('/research/combos', base)
 url.searchParams.set('limit', '1000')
 const incoming: ResearchCombo[] = []
 let invalid = 0
 let cursor = ''
 do {
  if (cursor) url.searchParams.set('after', cursor)
  const response = await fetch(url, {signal: AbortSignal.timeout(20000), credentials: 'omit'})
  if (!response.ok) throw new Error('Research API HTTP ' + response.status)
  const page = await response.json()
  if (!Array.isArray(page.combos)) throw new Error('Invalid research response')
  const parsed = parseResearchImport(page)
  incoming.push(...parsed.rows)
  invalid += parsed.invalid
  const next = page.nextCursor
  if (next != null && (typeof next !== 'string' || next <= cursor)) throw new Error('Invalid research cursor')
  cursor = next ?? ''
 } while (cursor)

 const merged = new Map(readResearchHistory().map(row => [row.id, row]))
 for (const row of incoming) merged.set(row.id, {...row, odds: merged.get(row.id)?.odds ?? row.odds})
 localStorage.setItem(STORE, JSON.stringify([...merged.values()]))
 localStorage.setItem(SYNC_TIME, new Date().toISOString())
 window.dispatchEvent(new Event(RESEARCH_UPDATED))
 return {received: incoming.length, invalid}
}

const pending = new Map<string, ReturnType<typeof downloadResearch>>()
export function syncResearch(base = researchUrl()) {
 const active = pending.get(base)
 if (active) return active
 const job = downloadResearch(base).finally(() => pending.delete(base))
 pending.set(base, job)
 return job
}
