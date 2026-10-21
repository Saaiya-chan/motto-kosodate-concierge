import fs from 'node:fs';
const base='http://127.0.0.1:7093';
const upload=JSON.parse(fs.readFileSync('evaluation/docsgpt/results/upload.json'));
for(const [name,route] of [['chunks',`/api/get_chunks?id=${upload.source_id}&per_page=1000`],['directory',`/api/directory_structure?id=${upload.source_id}`],['ingestion',`/api/task_status?task_id=${upload.task_id}`]]){const r=await fetch(base+route);const d=await r.json();fs.writeFileSync(`evaluation/docsgpt/results/${name}.json`,JSON.stringify(d,null,2));console.log(name,r.status,Array.isArray(d)?d.length:Object.keys(d));}
