import test from 'node:test'
import assert from 'node:assert/strict'
import {parseCmd,qualifyingForwardCombos} from '../src/worker.mjs'

test('team abbreviation alone returns both status and combos',()=>{
 assert.deepEqual(parseCmd('TBL'),{type:'TEAM',team:'TBL',detail:'BOTH'})
 assert.deepEqual(parseCmd('tbl'),{type:'TEAM',team:'TBL',detail:'BOTH'})
})
test('team abbreviation Status and Combos return their respective modes',()=>{
 assert.deepEqual(parseCmd('TBL Status'),{type:'TEAM',team:'TBL',detail:'STATUS'})
 assert.deepEqual(parseCmd('tbl combos'),{type:'TEAM',team:'TBL',detail:'COMBOS'})
 assert.deepEqual(parseCmd('  /TBL    Combos  '),{type:'TEAM',team:'TBL',detail:'COMBOS'})
 assert.equal(parseCmd('TBL nonsense').type,'HELP')
})
test('global status and established commands are preserved',()=>{
 assert.deepEqual(parseCmd('Status'),{type:'STATUS'})
 assert.deepEqual(parseCmd('Ping'),{type:'PING'})
 assert.deepEqual(parseCmd('Next'),{type:'NEXT'})
 assert.deepEqual(parseCmd('CAR'),{type:'TEAM',team:'CAR',detail:'BOTH'})
})
test('qualifying forwards must share same line and power-play unit',()=>{
 const snapshot={
  'Forward lines':['A, B, C','D, E, F','G, H, I','J, K, L'],
  'Defensive pairs':['M, N','O, P','Q, R'],
  PP1:['A, B, C, D, X'],PP2:['E, F, G, H, Y']
 }
 assert.deepEqual(qualifyingForwardCombos(snapshot),[
  {line:'FL1',unit:'PP1',players:['A','B','C']},
  {line:'FL2',unit:'PP2',players:['E','F']},
  {line:'FL3',unit:'PP2',players:['G','H']}
 ])
})
test('one-player overlap and absent lineup produce no combos',()=>{
 assert.deepEqual(qualifyingForwardCombos(null),[])
 assert.deepEqual(qualifyingForwardCombos({'Forward lines':['A, B, C'],PP1:['A, D, E, F, G'],PP2:['B, H, I, J, K']}),[])
})
