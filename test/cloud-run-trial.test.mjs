import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('no-log mobile trial rejects consent and cannot record a forged token',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motto-nolog-trial-'));
 const port=4326,base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['src/server.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',APP_PUBLIC_ORIGIN:'',RAILWAY_PUBLIC_DOMAIN:'',MOTTO_GEMINI_PRIVATE_DIR:dir,CHAT_LOG_DIR:join(dir,'logs'),CHAT_LOG_DISABLED:'1',RURI_PRELOAD:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{proc.stdout.once('data',resolve);proc.once('error',reject);proc.once('exit',()=>reject(Error('server exited')));});
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const policy=await(await fetch(base+'/api/log-consent')).json();assert.equal(policy.enabled,false);
  assert.equal((await post('/api/log-consent',{action:'grant'})).status,403);
  assert.equal((await fetch(base+'/api/admin/logs')).status,401);
  const response=await post('/api/chat',{guided:true,provider:'local',logConsentToken:'a'.repeat(64),messages:[{role:'user',content:'昼間に少し休みたい'}]});
  assert.equal(response.status,200);assert.equal((await response.json()).logging.saved,false);
  const html=await(await fetch(base+'/')).text();assert.match(html,/Cloud Run試用版：会話は保存しません/);assert.match(html,/<section class="log-consent" hidden>/);assert.ok(!html.match(/<footer>[\s\S]*?<\/footer>/)[0].includes('保存期限は同意から30日です。'));
  assert.equal((await readdir(join(dir,'logs'))).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).length,0);
 }finally{const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill();await done;await rm(dir,{recursive:true,force:true});}
});
