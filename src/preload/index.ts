import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('nhlTracker', {
  score: (date?: string) => ipcRenderer.invoke('nhl:score', date),
  playByPlay: (gameId: number) => ipcRenderer.invoke('nhl:pbp', gameId),
  landing: (gameId: number) => ipcRenderer.invoke('nhl:landing', gameId),
  boxscore: (gameId: number) => ipcRenderer.invoke('nhl:boxscore', gameId),
  roster: (team: string) => ipcRenderer.invoke('nhl:roster', team),
  standings: () => ipcRenderer.invoke('nhl:standings'),
  clubStats: (team: string) => ipcRenderer.invoke('nhl:clubStats', team),
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', { title, body }),
  updateInfo: () => ipcRenderer.invoke('app:updateInfo'),
  openUpdateUrl: (url: string) => ipcRenderer.invoke('app:openUpdateUrl', url)
})
