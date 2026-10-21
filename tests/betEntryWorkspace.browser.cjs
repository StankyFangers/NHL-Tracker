// Run against npm run build served at http://127.0.0.1:5180.
// QA tools are supplied outside the app's production dependencies.
const {chromium}=require(process.env.NHL_QA_TOOLS+'/playwright')
const {expect}=require(process.env.NHL_QA_TOOLS+'/@playwright/test')
const serverChromium=require(process.env.NHL_QA_TOOLS+'/@sparticuz/chromium/build/index.js').default
;(async()=>{
 const browser=await chromium.launch({executablePath:await serverChromium.executablePath(),args:serverChromium.args,headless:true})
 const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'America/New_York'})
 global.qaPage=page;page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  const date='2026-10-20',teams={PIT:['Sidney Crosby','Evgeni Malkin','Bryan Rust','Kris Letang','Erik Karlsson'],WSH:['Alex Ovechkin','Dylan Strome','Tom Wilson','John Carlson','Matt Roy'],COL:['Nathan MacKinnon','Martin Necas','Artturi Lehkonen','Cale Makar','Devon Toews'],TOR:['Auston Matthews','William Nylander','John Tavares','Morgan Rielly','Jake McCabe']}
  const players=Object.entries(teams).flatMap(([team,names],i)=>names.map((name,j)=>({id:100+i*10+j,name,team,position:j<3?'C':'D',gameId:i<2?'1001':'1002'})))
  const games=[['PIT','WSH'],['COL','TOR']].map(([away,home],i)=>({id:1001+i,gameState:'FUT',startTimeUTC:'2026-10-20T23:00:00Z',awayTeam:{abbrev:away,score:0},homeTeam:{abbrev:home,score:0}}))
  window.__qaGames=games;localStorage.setItem('hiddenTeams','[]');localStorage.setItem('unitSize','15');localStorage.setItem('activeSlateDate',date)
  let cloud=JSON.parse(localStorage.getItem('__qaCloud')||'[]'),rev=0
  window.__qaMutations=[];window.__qaFailBox=false
  const dfo=team=>({team,forwardLines:[teams[team]?.slice(0,3)||[]],defensePairs:[teams[team]?.slice(3)||[]],pp1:team==='WSH'?[...teams[team].slice(0,2),...teams[team].slice(3)]:teams[team]||[],pp2:team==='WSH'?[teams[team][2]]:[],goalies:[],injuries:[],updatedAt:'2026-10-20T17:00:00Z',checkedAt:'2026-10-20T18:00:00Z',source:'Team Report',sourceUrl:'https://example.org/lineup'})
  window.nhlTracker={
   liveAccountRequest:async()=>({account:{username:'friend',role:'USER'}}),
   liveWagersRequest:async p=>{
    if(p.method==='GET')return {wagers:cloud.sort((a,b)=>a.wager_id<b.wager_id?-1:1),nextCursor:null}
    window.__qaMutations.push(p)
    const id=p.id||p.wager.id,updatedAt='2026-10-20T19:00:00.'+String(++rev).padStart(6,'0')+'Z'
    if(p.method==='DELETE')cloud=cloud.filter(w=>w.wager_id!==id)
    else{cloud=cloud.filter(w=>w.wager_id!==id);cloud.push({wager_id:id,wager:p.wager,updated_at:updatedAt})}
    localStorage.setItem('__qaCloud',JSON.stringify(cloud));return {ok:true,id,updatedAt,created:p.method==='POST',deleted:p.method==='DELETE'}
   },
   score:async()=>({games:JSON.parse(JSON.stringify(games))}),landing:async()=>({gameState:'FUT'}),playByPlay:async()=>({plays:[]}),shiftcharts:async()=>({data:[]}),
   boxscore:async id=>{if(window.__qaFailBox)throw Error('Simulated NHL outage');const rows=players.filter(p=>Number(p.gameId)===id).map(p=>({playerId:p.id,name:{default:p.name},toi:'0:00',goals:0,assists:0}));return {gameState:'FUT',playerByGameStats:{homeTeam:{forwards:rows}}}},
   roster:async team=>{if(window.__qaFailBox)throw Error('Simulated NHL outage');return ({forwards:players.filter(p=>p.team===team&&p.position==='C').map(p=>({id:p.id,firstName:{default:p.name.split(' ')[0]},lastName:{default:p.name.split(' ').slice(1).join(' ')},positionCode:p.position})),defensemen:players.filter(p=>p.team===team&&p.position==='D').map(p=>({id:p.id,firstName:{default:p.name.split(' ')[0]},lastName:{default:p.name.split(' ').slice(1).join(' ')},positionCode:p.position})),goalies:[]})},
   dfoLines:async team=>dfo(team),dfoGoalieToi:async()=>({}),dfoPlayerStats:async(team,names)=>Object.fromEntries(names.map(name=>[name.toLowerCase(),{averageToi:'18:45',l10:{g:2,a:3,p:5,sog:20},season:{g:3,a:5,p:8,sog:30}}])),
   standings:async()=>({standings:[]}),clubStats:async()=>({}),registryPlayers:async()=>({players:[],available:false}),livePlayersRequest:async()=>({players:[]}),notify:async()=>true,updateInfo:async()=>({status:'NO_RELEASE'})
  }
 })
 await page.goto('http://127.0.0.1:5180')
 await page.getByLabel('USERNAME OR EMAIL').fill('friend');await page.getByLabel('PASSWORD',{exact:true}).fill('test-password');await page.getByRole('button',{name:'LOG IN TO NHL TRACKER'}).click()
 await expect(page.getByRole('button',{name:'LIVE GAME TRACKER',exact:true})).toBeVisible()
 console.log('Opening Bet Entry');await page.getByRole('button',{name:'BET ENTRY',exact:true}).click()
 await expect(page.getByRole('heading',{name:/Bet Slip/})).toBeVisible()
 // Compact matchup and confidence disclosure, without persistent status strips.
 await expect(page.locator('.app>div[role="status"]')).toHaveCount(0)
 await page.locator('.entryMatchupBubble').nth(1).click()
 await expect(page.locator('.entryConfidenceScore')).toHaveCount(2)
 await page.locator('.entryConfidenceDisclosure summary').click()
 await expect(page.locator('.entryConfidencePopover')).toBeVisible()
 await page.locator('.entryConfidencePopover .confidenceCard').first().click()
 await page.locator('.entryConfidencePopover .confidenceMetricRow').first().click()
 await expect(page.locator('.entryConfidencePopover .confidenceMetricEvidence')).toBeVisible()
 await page.locator('.entryConfidenceDisclosure summary').click()
 // Exact keyboard sequence: player Tab qty Tab stat Enter, repeat, Enter -> category.
 const playerSearch=page.locator('.entrySlip input[aria-label="Player search"]')
 const target=page.locator('.slipBuildControls .entryRow input').nth(1)
 const market=page.locator('.slipBuildControls .entryRow input').nth(2)
 await expect(page.locator('.playerSuggestions:visible')).toHaveCount(0)
 for(const query of ['crosby','malkin']){
  await playerSearch.fill(query)
  await expect(page.locator('.playerSuggestions:visible')).toHaveCount(1)
  await playerSearch.press('Tab');await expect(target).toBeFocused()
  await expect(page.locator('.playerSuggestions:visible')).toHaveCount(0)
  await target.fill('1');await target.press('Tab');await expect(market).toBeFocused()
  await market.fill('p');await market.press('Enter');await expect(playerSearch).toBeFocused()
 }
 await expect(page.locator('.slipLeg')).toHaveCount(2)
 await expect(page.locator('.playerSuggestions:visible')).toHaveCount(0)
 await playerSearch.press('Enter');await expect(page.locator('.slipPricing select').first()).toBeFocused()
 await page.locator('.slipPricing select').first().press('Tab');await expect(page.locator('.slipPricing .bookField input')).toBeFocused()
 await playerSearch.fill('rust');await page.locator('.slipPricing .bookField input').click()
 await expect(page.locator('.playerSuggestions:visible')).toHaveCount(0)
 await playerSearch.fill('');await page.getByRole('button',{name:'CLEAR BET SLIP',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(0)
 await page.locator('.entryMatchupBubble.allTile').click()

 await expect(page.getByRole('button',{name:'ADD TO BET SLIP',exact:true}).first()).toBeVisible()
 console.log('Entry open');await page.screenshot({path:'/tmp/nhl-entry-initial.png',fullPage:true});
 const beforeSlip=(await page.locator('.entrySlipPane').boundingBox()).height
 await page.getByRole('separator',{name:'Resize bet slip and lineup information'}).press('ArrowDown')
 if((await page.locator('.entrySlipPane').boundingBox()).height<=beforeSlip)throw Error('Horizontal splitter did not resize')
 // Confirmed trio is one append, not four batch wager variants.
 await page.getByRole('button',{name:'ADD TO BET SLIP',exact:true}).first().click()
 await expect(page.locator('.slipLeg')).toHaveCount(3)
 await page.getByRole('tab',{name:'Defense Pairs',exact:true}).click()
 await page.locator('.dfoPlayer').first().getByRole('button',{name:'ADD TO BET SLIP'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(4)
 await expect(page.locator('.dfoPlayer').first()).toContainText('DP1')
 await expect(page.locator('.dfoPlayer').first()).toContainText('PP1')
 await expect(page.locator('.dfoPlayer').first()).toContainText('18:45')
 console.log('Single append done');
 // Select another matchup, append a full combo, and preserve quantity edits.
 await page.getByLabel('Target for Sidney Crosby').fill('2')
 await page.locator('.entryMatchupBubble').nth(2).click()
 await page.getByRole('tab',{name:'Line Combos',exact:true}).click()
 await page.getByRole('button',{name:'ADD COMBO TO BET SLIP'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(7)
 await expect(page.getByLabel('Target for Sidney Crosby')).toHaveValue('2')
 // Team and lineup switches preserve all legs.
 await page.locator('.entryResearchContent .comboTeamToggle').getByRole('button',{name:'TOR',exact:true}).click()
 await page.getByRole('tab',{name:'Power Play Lines',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(7)
 await page.locator('.dfoPlayer').first().getByRole('button',{name:'ADD TO BET SLIP'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(8)
 await page.getByRole('button',{name:'Remove Auston Matthews'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(7)
 await page.getByRole('tab',{name:'Confirmed Lines',exact:true}).click()
 await expect(page.locator('.confirmedTeam')).toHaveText('✓ TOR')
 await page.getByRole('tab',{name:'Forward Lines',exact:true}).click()
 await expect(page.locator('.entryResearchContent .comboTeamToggle button.selected')).toHaveText('TOR')
 await page.locator('.dfoPlayer').first().getByRole('button',{name:'ADD TO BET SLIP'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(8)
 await page.getByRole('button',{name:'Remove Auston Matthews'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(7)
 console.log('Team/tab switches done');
 await page.screenshot({path:'/tmp/nhl-entry-filled.png',fullPage:true});
 // Whole header navigation preserves the one draft, and Quick Bet is a drawer.
 await page.getByRole('button',{name:'LIVE GAME TRACKER',exact:true}).click()
 await expect(page.locator('.comboPane')).toHaveCount(0)
 const beforeWidth=(await page.locator('.betsPane').boundingBox()).width
 const handle=await page.locator('.betResizeHandle').boundingBox()
 await page.mouse.move(handle.x+handle.width/2,handle.y+30);await page.mouse.down();await page.mouse.move(handle.x-180,handle.y+30,{steps:8});await page.mouse.up()
 await expect.poll(async()=>(await page.locator('.betsPane').boundingBox()).width).toBeGreaterThan(beforeWidth+20)
 await page.getByRole('button',{name:'Hide bets',exact:true}).click();await expect(page.locator('.betsPane')).toBeHidden()
 await page.getByRole('button',{name:'Show bets',exact:true}).click();await expect(page.locator('.betsPane')).toBeVisible()
 await page.getByRole('button',{name:'Hide left pane',exact:true}).click();await expect(page.locator('.livePane')).toBeHidden()
 await page.getByRole('button',{name:'Show left pane',exact:true}).click();await expect(page.locator('.livePane')).toBeVisible()
 await page.getByRole('button',{name:'QUICK BET',exact:true}).click()
 await expect(page.locator('.betDrawer')).toBeVisible()
 await page.locator('.drawerHead button').click()
 console.log('Opening Bet Entry');await page.getByRole('button',{name:'BET ENTRY',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(7)
 console.log('Quick bet drawer done');
 const slip=page.getByRole('region',{name:'Bet Slip'})
 await slip.getByLabel('SPORTSBOOK',{exact:true}).fill('Fanatics');await slip.getByLabel('SPORTSBOOK',{exact:true}).press('Tab')
 await slip.getByLabel('UNITS',{exact:true}).fill('1');await slip.getByLabel('AMERICAN ODDS',{exact:true}).fill('150')
 await page.evaluate(()=>{window.__qaIdentityBackup=localStorage.getItem('nhlTracker:playerIdentityDb:v1');localStorage.setItem('nhlTracker:playerIdentityDb:v1','[]');window.__qaFailBox=true})
 await page.getByRole('button',{name:'SUBMIT BET',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(7)
 await expect(slip.getByRole('status')).toContainText(/Unable|Could not|outage|verify/i)
 await page.evaluate(()=>{localStorage.setItem('nhlTracker:playerIdentityDb:v1',window.__qaIdentityBackup);window.__qaFailBox=false})
 await page.getByRole('button',{name:'SUBMIT BET',exact:true}).dblclick()
 await expect(page.locator('.slipLeg')).toHaveCount(0)
 await expect(page.getByText('Cloud saved · 1 changes',{exact:true})).toBeVisible({timeout:10000})
 const creates=await page.evaluate(()=>window.__qaMutations.filter(p=>p.method==='POST'))
 if(creates.length!==1||creates[0].wager.legs.length!==7||creates[0].wager.groupKey!=='MULTI')throw Error('Submission was duplicated or lost cross-game legs')
 // Saved player identities are resolved; units are snapshotted.
 if(creates[0].wager.legs.some(l=>!l.playerId)||creates[0].wager.unitSize!==15)throw Error('Saved wager is missing identities or unit size')
 await page.screenshot({path:'/tmp/nhl-bet-entry-1920.png',fullPage:true})
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'/tmp/nhl-bet-entry-1280.png',fullPage:true})
 await page.locator('.dfoPlayer').first().getByRole('button',{name:'ADD TO BET SLIP'}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(1)
 await page.getByRole('button',{name:'CLEAR BET SLIP',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(0)
 await page.locator('.entryMatchupBubble.allTile').click()
 await page.locator('.confirmedCombo').filter({hasText:'✓ WSH'}).getByRole('button',{name:'ADD TO BET SLIP',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(2)
 await page.getByRole('button',{name:'CLEAR BET SLIP',exact:true}).click()
 await expect(page.locator('.slipLeg')).toHaveCount(0)
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
 if(overflow)throw Error('Layout overflows screen width')

 // Dense eleven-game slate at shorter desktop heights.
 await page.evaluate(()=>{const pairs=[['ANA','NYI'],['NJD','SJS'],['LAK','VAN'],['MIN','EDM'],['DET','SEA'],['WPG','STL'],['BOS','DAL'],['CAR','VGK'],['TBL','MTL']];window.__qaGames.push(...pairs.map(([away,home],i)=>({id:1010+i,gameState:'FUT',startTimeUTC:'2026-10-20T23:00:00Z',awayTeam:{abbrev:away,score:0},homeTeam:{abbrev:home,score:0}})))})
 await expect(page.locator('.entryMatchupBubble')).toHaveCount(12,{timeout:10000})
 for(const [width,height] of [[1920,900],[1280,720]]){
  await page.setViewportSize({width,height})
  const geometry=await page.evaluate(()=>({bar:document.querySelector('.entryMatchups').getBoundingClientRect().height,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))
  if(geometry.bar>60||geometry.width>width||geometry.height>height)throw Error('Dense compact layout overflow '+JSON.stringify(geometry))
  await page.screenshot({path:'/tmp/nhl-compact-'+width+'.png',fullPage:true})
 }
 await page.locator('.entryMatchupBubble').nth(1).click();await page.locator('.entryConfidenceDisclosure summary').click()
 await page.screenshot({path:'/tmp/nhl-compact-confidence.png',fullPage:true})
 await page.reload()
 await page.getByLabel('USERNAME OR EMAIL').fill('friend');await page.getByLabel('PASSWORD',{exact:true}).fill('test-password');await page.getByRole('button',{name:'LOG IN TO NHL TRACKER'}).click()
 await expect(page.getByText('Cloud connected · 1 wagers',{exact:true})).toBeVisible()
 if(errors.length)throw Error(errors.join('\n'))
 console.log('PASS: trio/single/cross-game appends; all tabs/team switches; main navigation persistence; Quick Bet drawer; failed submit retains slip; one validated cloud submission; responsive width. No browser errors.')
 await browser.close()
})().catch(async e=>{console.error(e);if(global.qaPage){await global.qaPage.screenshot({path:'/tmp/nhl-entry-failure.png',fullPage:true}).catch(()=>{});console.error((await global.qaPage.locator('body').innerText()).slice(-3000))}process.exit(1)})
