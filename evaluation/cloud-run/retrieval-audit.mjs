import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root = new URL('../../',import.meta.url);
const read = async p=>JSON.parse(await fs.readFile(new URL(p,root),'utf8'));
const measured = await read('.private/search-probe-cloud-run.json');
const deployment = await read('.private/cloud-run-deployment.json');
const agent = await read('.private/docsgpt-agent.json');
const token = (await fs.readFile(new URL('.private/search-container.env',root),'utf8')).trim().split('=')[1];
const identity = (await fs.readFile(new URL('.private/cloud-run-identity-token',root),'utf8')).trim();
const digest = hit=>createHash('sha256').update(hit.title+'\n'+hit.text).digest('hex');
const audit=[];
for(const row of measured.retrieval.filter(r=>!r.same)) {
 const hits=[];
 for(const [base,key] of [['http://127.0.0.1:7093',agent.key],[deployment.url,token]]) {
  const response=await fetch(base+'/api/search',{method:'POST',headers:{'content-type':'application/json',...(base===deployment.url?{'X-Serverless-Authorization':'Bearer '+identity}:{})},body:JSON.stringify({question:row.query,chunks:6,api_key:key})});
  if(!response.ok)throw Error('Retrieval audit HTTP '+response.status);
  hits.push(await response.json());
 }
 audit.push({query:row.query,sameSet:JSON.stringify([...hits[0].map(digest)].sort())===JSON.stringify([...hits[1].map(digest)].sort()),hits:hits.map(list=>list.map(h=>({title:h.title,text:h.text,hash:digest(h),distance:h.distance})))});
}
await fs.writeFile(new URL('.private/cloud-run-retrieval-audit.json',root),JSON.stringify(audit,null,2),{mode:0o600});
console.log(JSON.stringify(audit.map(r=>({query:r.query,sameSet:r.sameSet,ranked:r.hits.map(hits=>hits.map(h=>({title:h.title,distance:h.distance,hash:h.hash.slice(0,8)})))})),null,2));
