import {useCallback} from 'react'
import {useScheduledConfidenceFeed} from './useScheduledConfidenceFeed'
export function useConfidenceTeamStats(date:string){
 const request=useCallback((force:boolean)=>window.nhlTracker.confidenceTeamStats(date,force),[date])
 return useScheduledConfidenceFeed(date,'nhlTracker:confidenceSources:nhl:v1',request)
}
