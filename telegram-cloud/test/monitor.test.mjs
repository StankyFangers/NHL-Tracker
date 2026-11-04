import test from 'node:test';import assert from 'node:assert/strict';
import {pollingInterval,progress,parseLineStatus} from '../src/worker.mjs';
test('Intervals by time to puck drop',()=>{assert.equal(pollingInterval(10*3600000),Infinity);assert.equal(pollingInterval(9*3600000),3600000);assert.equal(pollingInterval(8*3600000),3600000);assert.equal(pollingInterval(7*3600000),1800000);assert.equal(pollingInterval(5*3600000),1800000);assert.equal(pollingInterval(4*3600000),900000);assert.equal(pollingInterval(2*3600000),900000);assert.equal(pollingInterval(3600000),300000);assert.equal(pollingInterval(16*60000),300000);assert.equal(pollingInterval(15*60000),60000);assert.equal(pollingInterval(0),Infinity)});
test('Progress',()=>assert.equal(progress({teams:['A','B','C','D'],confirmed:['A','B','C'],remaining:['D']}),'3/4 teams confirmed (1 remaining)'));
test('Never confirm missing attribution',()=>assert.equal(parseLineStatus('<html>lineups</html>','2026-11-03').status,'UNKNOWN'));
