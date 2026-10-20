import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nhlTracker', {
  saveLineComboPdf: (payload: {title:string;subtitle:string;lines:string[]}) => ipcRenderer.invoke('app:saveLineComboPdf',payload),
  score: (date?: string) => ipcRenderer.invoke('nhl:score', date),
  playByPlay: (gameId: number) => ipcRenderer.invoke('nhl:pbp', gameId),
  landing: (gameId: number) => ipcRenderer.invoke('nhl:landing', gameId),
  shiftcharts: (gameId: number) => ipcRenderer.invoke('nhl:shiftcharts', gameId),
  boxscore: (gameId: number) => ipcRenderer.invoke('nhl:boxscore', gameId),
  roster: (team: string) => ipcRenderer.invoke('nhl:roster', team),
  playerSearch: (query: string) => ipcRenderer.invoke('nhl:playerSearch', query),
  devBetsRequest: (payload: {method:'GET'|'PUT'|'DELETE';bets?:unknown[];revision?:number;confirm?:string}) => ipcRenderer.invoke('dev-bets:request', payload),
  liveAccountRequest: (payload: {action:string;username?:string;email?:string;login?:string;password?:string}) => ipcRenderer.invoke('live-account:request', payload),
  livePlayersRequest: (payload: {method:'GET'|'POST';id?:number;name?:string;team?:string}) => ipcRenderer.invoke('live-players:request', payload),
  liveWagersRequest: (payload: {method:'GET';limit?:number;cursor?:string}) => ipcRenderer.invoke('live-wagers:request', payload),
  devAccountRequest: (payload: {action:string;username?:string;email?:string;login?:string;password?:string;setupKey?:string}) => ipcRenderer.invoke('dev-account:request', payload),
  registryPlayers: () => ipcRenderer.invoke('registry:players'),
  standings: () => ipcRenderer.invoke('nhl:standings'),
  clubStats: (team: string) => ipcRenderer.invoke('nhl:clubStats', team),
  dfoLines: (team: string) => ipcRenderer.invoke('dfo:lines', team),
  dfoPlayerStats: (team: string, names: string[]) => ipcRenderer.invoke('dfo:playerStats', team, names),
  dfoGoalieToi: (team: string, names: string[]) => ipcRenderer.invoke('dfo:goalieToi', team, names),
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', { title, body }),
  updateInfo: () => ipcRenderer.invoke('app:updateInfo'),
  openUpdateUrl: (url: string) => ipcRenderer.invoke('app:openUpdateUrl', url)
})
