import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

test('account API rejects calls with no signed-in account token',async()=>{
 const response=await worker.fetch(new Request('https://example.workers.dev/account/status'),{}, {waitUntil(){}});
 assert.equal(response.status,401);
 const json=await response.json();
 assert.match(json.error,/Sign in/);
});
test('Telegram webhook rejects a missing webhook secret',async()=>{
 const response=await worker.fetch(new Request('https://example.workers.dev/telegram',{method:'POST'}),{}, {waitUntil(){}});
 assert.equal(response.status,401);
});
test('Health endpoint does not disclose secrets',async()=>{
 const response=await worker.fetch(new Request('https://example.workers.dev/health'),{}, {waitUntil(){}});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,service:'NHL Telegram DEV'});
});
test('No scheduled monitoring before 10 AM Eastern',async()=>{
 const {tick}=await import('../src/worker.mjs');
 const result=await tick({},new Date('2026-11-04T14:59:00Z'));
 assert.equal(result.checked,0);
 assert.match(result.note,/Before 10 AM/);
});
