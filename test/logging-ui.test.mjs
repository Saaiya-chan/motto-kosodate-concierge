import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=(await readFile(new URL('../public/logging.js',import.meta.url),'utf8')).replace('export function','function')+'\nthis.bind=bindLogConsent;';
function setup(saved=null,{failGrant=false}={}){
 const storage=new Map(saved?[['motto-log-consent-v1',JSON.stringify(saved)]]:[]),calls=[];
 const element=()=>({checked:true,disabled:true,dataset:{},classList:{toggle(){}},addEventListener(name,fn){this[name]=fn;}});
 const checkbox=element(),notice=element(),retry=element();
 const context=vm.createContext({crypto:{randomUUID},document:{getElementById:id=>({'log-consent':checkbox,'log-consent-status':notice,'log-revoke-retry':retry})[id]},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(path,options)=>{const body=options?JSON.parse(options.body):null;calls.push(body?.action||'policy');return{ok:!(failGrant&&body?.action==='grant'),json:async()=>body?.action==='grant'?{token:'a'.repeat(64),error:'failed'}:{version:'v1',active:false}};}});
 vm.runInContext(source,context);return{api:context.bind(),checkbox,storage,calls};
}
test('preselected consent creates no server grant until sending a turn',async()=>{
 const s=setup();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(s.calls,['policy']);assert.equal(s.api.requestFields().logConsentToken,undefined);
 await s.api.wait();assert.deepEqual(s.calls,['policy','grant']);assert.equal(s.api.requestFields().logConsentToken,'a'.repeat(64));
});
test('opting out before sending persists across reload without creating consent',async()=>{
 const s=setup();await new Promise(resolve=>setImmediate(resolve));s.checkbox.checked=false;s.checkbox.change();await s.api.wait();assert.deepEqual(s.calls,['policy']);
 const saved=JSON.parse(s.storage.get('motto-log-consent-v1'));assert.equal(saved.state,'off');const reload=setup(saved);await reload.api.wait();assert.equal(reload.checkbox.checked,false);assert.deepEqual(reload.calls,['policy']);
});
test('failed automatic grant continues with no logging token and unchecked control',async()=>{
 const s=setup(null,{failGrant:true});await s.api.wait();assert.equal(s.api.requestFields().logConsentToken,undefined);assert.equal(s.checkbox.checked,false);
});
