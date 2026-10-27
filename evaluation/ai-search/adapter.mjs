import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {manifest} from '../../src/rag.mjs';
import {namedPrograms} from '../../src/dialogue.mjs';
import trustedHeadings from './trusted-headings.json' with {type:'json'};
export const endpoint='https://api.cloudflare.com/client/v4/accounts/44574b6f591973f3bef7e73cc34826fa/ai-search/namespaces/default/instances/motto-concierge-12-docs-eval/search';
async function readToken(){
 const text=await readFile(join(homedir(),'Library/Preferences/.wrangler/config/default.toml'),'utf8');
 const token=text.match(/^oauth_token\s*=\s*"([^"\r\n]+)"/m)?.[1];
 if(!token)throw Error('Wrangler OAuth login required');return token;
}
const normalizeHeading=s=>s.normalize('NFKC').replace(/<[^>]*>/g,'').replace(/\s/g,'');
export function restoreHeadings(text,headings=[]){
 const trusted=headings.map(normalizeHeading);
 return text.split('\n').map(line=>{
  const label=line.trim();
  if(!label||label.length>80||/^#/.test(label)||!namedPrograms(label).length)return line;
  // Restore formatting only for a standalone label found in the old, trusted source headings.
  // Words and ordering remain unchanged; no paragraph is assigned a broader programme scope.
  if(!trusted.some(heading=>heading.includes(normalizeHeading(label))))return line;
  return '# '+line;
 }).join('\n');
}
export function normalizeChunks(chunks,library=manifest.sources,headings=trustedHeadings){
 if(!Array.isArray(chunks))throw Error('AI Search did not return chunks');
 return chunks.map(chunk=>{
  const filename=typeof chunk.item?.key==='string'?chunk.item.key.split('/').at(-1):'';
  const known=library.find(s=>s.file.split('/').at(-1).replace(/\.html$/,'.txt')===filename);
  if(!known||typeof chunk.text!=='string'||!chunk.text.trim())return null;
  return {filename,title:filename,source:filename,text:restoreHeadings(chunk.text,headings[filename]),score:chunk.score};
 }).filter(Boolean);
}
export function createAISearchFetcher({fetcher=fetch,getToken=readToken,onCall=()=>{},library=manifest.sources}={}){
 return async(url,options={})=>{
  if(!url.endsWith('/api/search'))throw Error('Unsupported evaluation route');
  const {question,chunks}=JSON.parse(options.body);
  const start=performance.now();
  const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await getToken()}`},
   body:JSON.stringify({query:question,ai_search_options:{retrieval:{max_num_results:chunks,match_threshold:0,retrieval_type:'hybrid',keyword_match_mode:'or'},query_rewrite:{enabled:false},reranking:{enabled:false},cache:{enabled:false}}}),signal:options.signal});
  if(!response.ok){onCall({question,status:response.status,elapsedMs:Math.round(performance.now()-start)});return new Response('{}',{status:response.status});}
  const envelope=await response.json(),data=envelope.result??envelope;
  const hits=normalizeChunks(data.chunks,library);
  onCall({question,status:response.status,elapsedMs:Math.round(performance.now()-start),chunks:hits.length,sources:hits.map(h=>h.filename),requestId:response.headers.get('cf-ray')});
  return Response.json(hits);
 };
}
