/// <reference types="vite/client" />
interface Window {
  nhlTracker: {
    saveLineComboPdf: (payload: {slateDate?:string;title:string;subtitle:string;lines:string[]}) => Promise<{saved?:boolean;cancelled?:boolean;error?:string}>
    score: (date?: string) => Promise<any>
    playByPlay: (gameId: number) => Promise<any>
    landing: (gameId: number) => Promise<any>
    shiftcharts: (gameId: number) => Promise<any>
    boxscore: (gameId: number) => Promise<any>
    roster: (team: string) => Promise<any>
    liveWagersRequest: (payload: {method:'GET';limit?:number;cursor?:string}) => Promise<{wagers?:Array<{wager_id:string;wager:unknown;updated_at:string}>;nextCursor?:string|null;error?:string;status?:number}>
    registryPlayers: () => Promise<{available:boolean;players:Array<{id:string;name:string;team?:string;teams?:string[]}>}>
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
