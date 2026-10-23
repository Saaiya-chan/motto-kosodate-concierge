import {mkdtemp,mkdir,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const parent=await mkdtemp(join(tmpdir(),'motto-railway-contexts-'));
for(const service of ['web','docsgpt']){
 const target=join(parent,service);await mkdir(target);
 const folders=service==='web'?['src','public','data']:['data'];
 for(const folder of folders)await cp(join(root,folder),join(target,folder),{recursive:true});
 if(service==='web'){
  for(const file of ['package.json','Dockerfile'])await cp(join(root,file),join(target,file));
 }else{
  const scripts=join(target,'deployment','docsgpt');await mkdir(scripts,{recursive:true});
  for(const file of ['start.py','seed.py','google.yaml'])await cp(join(root,'deployment/docsgpt',file),join(scripts,file));
  await cp(join(root,'deployment/docsgpt/Dockerfile'),join(target,'Dockerfile'));
 }
}
console.log(JSON.stringify({web:join(parent,'web'),docsgpt:join(parent,'docsgpt')}));
