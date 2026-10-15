/// <reference types="vite/client" />
interface Window {
  nhlTracker: {
    saveLineComboPdf: (payload: {title:string;subtitle:string;lines:string[]}) => Promise<{saved?:boolean;cancelled?:boolean;error?:string}>
    score: (date?: string) => Promise<any>
    playByPlay: (gameId: number) => Promise<any>
    landing: (gameId: number) => Promise<any>
    shiftcharts: (gameId: number) => Promise<any>
    boxscore: (gameId: number) => Promise<any>
    roster: (team: string) => Promise<any>
    standings: () => Promise<any>
    clubStats: (team: string) => Promise<any>
    dfoLines: (team: string) => Promise<any>
    dfoPlayerStats: (team: string, names: string[]) => Promise<any>
    dfoGoalieToi: (team: string, names: string[]) => Promise<any>
    notify: (title: string, body: string) => Promise<any>
    updateInfo: () => Promise<any>
    openUpdateUrl: (url: string) => Promise<any>
  }
}
