import {useCallback} from 'react'
import {useScheduledConfidenceFeed} from './useScheduledConfidenceFeed'
export function useTeamOpportunityStats(date:string){
 const request=useCallback((force:boolean)=>window.nhlTracker.teamOpportunityStats(date,force),[date])
 return useScheduledConfidenceFeed(date,'nhlTracker:confidenceSources:opportunity:v1',request)
}
