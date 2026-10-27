import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRunFetch} from '../src/cloud-run-fetch.mjs';
test('IAM identity is shared across concurrent search calls and is never sent to Gemini',async()=>{
 const calls=[];
 const wrapped=createCloudRunFetch({audience:'https://search-test.run.app',fetcher:async(url,options)=>{
  calls.push({url,options});return url.startsWith('http://metadata.')?new Response('test-id-token'):new Response('{}');
 }});
 await Promise.all([wrapped('https://search-test.run.app/api/search'),wrapped('https://search-test.run.app/api/health')]);
 await wrapped('https://generativelanguage.googleapis.com/example');
 assert.equal(calls.filter(c=>c.url.startsWith('http://metadata.')).length,1);
 for(const c of calls.filter(c=>c.url.startsWith('https://search-test')))assert.equal(c.options.headers.get('X-Serverless-Authorization'),'Bearer test-id-token');
 assert.equal(calls.at(-1).options.headers,undefined);
});
test('metadata failure blocks search instead of invoking it without authentication',async()=>{
 let calls=0;const wrapped=createCloudRunFetch({audience:'https://search-test.run.app',fetcher:async()=>{calls++;return new Response('',{status:403});}});
 await assert.rejects(wrapped('https://search-test.run.app/api/search'));
 assert.equal(calls,1);
 assert.throws(()=>createCloudRunFetch({audience:'http://example.com'}));
});
