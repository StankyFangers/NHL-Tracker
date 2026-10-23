import type {Family} from './trioComparison'
export const TRIO_EXCLUSIONS_KEY='nhlTracker:trioComparison:excludedFamilies:v1'
export function readTrioExclusions(storage:Pick<Storage,'getItem'>=localStorage):string[]{
 try{const value=JSON.parse(storage.getItem(TRIO_EXCLUSIONS_KEY)||'[]');return Array.isArray(value)?[...new Set(value.filter((x):x is string=>typeof x==='string'))]:[]}catch{return []}
}
export function saveTrioExclusions(keys:string[],storage:Pick<Storage,'setItem'>=localStorage){storage.setItem(TRIO_EXCLUSIONS_KEY,JSON.stringify([...new Set(keys)]))}
export function partitionTrioFamilies(families:Family[],excludedKeys:string[]){const excluded=new Set(excludedKeys);return {included:families.filter(f=>!excluded.has(f.key)),removed:families.filter(f=>excluded.has(f.key))}}
