import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nhlTracker', {
  saveLineComboPdf: (payload: {title:string;subtitle:string;lines:string[]}) => ipcRenderer.invoke('app:saveLineComboPdf',payload),
  score: (date?: string) => ipcRenderer.invoke('nhl:score', date),
  playByPlay: (gameId: number) => ipcRenderer.invoke('nhl:pbp', gameId),
  landing: (gameId: number) => ipcRenderer.invoke('nhl:landing', gameId),
  shiftcharts: (gameId: number) => ipcRenderer.invoke('nhl:shiftcharts', gameId),
  boxscore: (gameId: number) => ipcRenderer.invoke('nhl:boxscore', gameId),
  roster: (team: string) => ipcRenderer.invoke('nhl:roster', team),
  standings: () => ipcRenderer.invoke('nhl:standings'),
  clubStats: (team: string) => ipcRenderer.invoke('nhl:clubStats', team),
  dfoLines: (team: string) => ipcRenderer.invoke('dfo:lines', team),
  dfoPlayerStats: (team: string, names: string[]) => ipcRenderer.invoke('dfo:playerStats', team, names),
  dfoGoalieToi: (team: string, names: string[]) => ipcRenderer.invoke('dfo:goalieToi', team, names),
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', { title, body }),
  updateInfo: () => ipcRenderer.invoke('app:updateInfo'),
  openUpdateUrl: (url: string) => ipcRenderer.invoke('app:openUpdateUrl', url)
})
