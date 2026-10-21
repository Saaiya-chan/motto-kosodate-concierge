import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';
import {request} from 'node:http';
import test from 'node:test';import assert from 'node:assert/strict';
const get=(path,host)=>new Promise((resolve,reject)=>{const req=request('http://127.0.0.1:4322'+path,{headers:{host}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
let proc,dir;const base='http://127.0.0.1:4322';
test.before(async()=>{dir=await mkdtemp(join(tmpdir(),'concierge-public-http-'));proc=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORT:'4322',APP_PUBLIC_ORIGIN:'https://concierge.example',MOTTO_GEMINI_PRIVATE_DIR:dir,RURI_PRELOAD:'0'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{proc.stdout.once('data',resolve);proc.once('error',reject);proc.once('exit',code=>reject(Error('server exited '+code)));});await fetch(base+'/api/health');});
test.after(async()=>{if(proc){const ended=new Promise(resolve=>proc.once('exit',resolve));proc.kill();await ended;}await rm(dir,{recursive:true,force:true});});
test('public host is accepted while unrelated hosts and origins are rejected',async()=>{
 assert.equal(await get('/','concierge.example'),200);
 assert.equal(await get('/','evil.example'),403);
 assert.equal(await get('/api/health','healthcheck.railway.app'),200);
 assert.equal((await fetch(base+'/api/log-consent',{method:'POST',headers:{host:'concierge.example',origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({action:'grant',version:'2026-10-21-v1'})})).status,403);
});
test('public admin sessions use Secure cookies and config stays protected',async()=>{
 const key=(await readFile(join(dir,'conversation-logs/admin-key'),'utf8')).trim();
 const response=await fetch(base+'/api/admin/login',{method:'POST',headers:{host:'concierge.example',origin:'https://concierge.example','content-type':'application/json'},body:JSON.stringify({key})});
 assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/; Secure/);
 assert.equal((await fetch(base+'/api/gemini/config',{method:'POST',headers:{host:'concierge.example',origin:'https://concierge.example','content-type':'application/json'},body:'{}'})).status,401);
});
