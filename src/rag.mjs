import {readFileSync} from 'node:fs';
import {aliases} from './dialogue.mjs';
import {catalog,bigrams} from './engine.mjs';
export const chunks=JSON.parse(readFileSync(new URL('../data/source-chunks.json',import.meta.url)));
export const manifest=JSON.parse(readFileSync(new URL('../data/source-manifest.json',import.meta.url)));
const sets=chunks.map(c=>bigrams(c.text));const frequency=new Map();for(const set of sets)for(const token of set)frequency.set(token,(frequency.get(token)||0)+1);
export function searchSources(query,programIds=[],limit=5){
let expanded=query;
for(const p of catalog.programs)for(const name of [p.name,...(aliases[p.id]||[])].sort((a,b)=>b.length-a.length))expanded=expanded.replaceAll(name,' ');
const phrases=[];
if(/休みたい|休息|育児疲れ|疲れました/.test(query))phrases.push('育児負担の軽減','育児疲れ');
if(/どんな|って何|とは|どういう/.test(query))phrases.push('事業の目的','支援内容','家事支援','対象者');
if(/料金|いくら|費用|無料|お金/.test(query))phrases.push('利用者負担','利用料','費用負担','徴収');
if(/掃除|料理|家事/.test(query))phrases.push('掃除','食事準備','食事の準備','家事支援');
if(/対象|何歳/.test(query))phrases.push('対象者','対象時期');
if(/どんな|って何|とは|どういう/.test(query))expanded+=' 事業 目的 内容 対象 支援';
if(/料金|いくら|費用|無料|お金/.test(query))expanded+=' 利用者負担 費用 負担 徴収 減免';
if(/何回|回数|頻度/.test(query))expanded+=' 利用回数 利用頻度';
if(/申込|申し込|手続|予約/.test(query))expanded+=' 利用申請 申込み 手続き';
const q=bigrams(expanded);const scores=chunks.map((chunk,i)=>{if(programIds.length&&!chunk.programIds.some(id=>programIds.includes(id)))return null;if(/目\s*次/.test(chunk.text)&&/[.．・]{5}/.test(chunk.text))return null;if(chunk.sourceId==='postpartum'&&chunk.page<11)return null;let score=0;for(const token of q)if(sets[i].has(token))score+=Math.log(1+chunks.length/(frequency.get(token)||1));for(const phrase of phrases)if(chunk.text.includes(phrase))score+=20;
return {...chunk,score:score/Math.sqrt(Math.max(120,sets[i].size))};}).filter(Boolean).filter(c=>c.score>0).sort((a,b)=>b.score-a.score);
// Keep an explanation/comparison from starving one of the referenced programs.
const chosen=[];for(const id of programIds.slice(0,3)){const first=scores.find(c=>c.programIds.includes(id));if(first&&!chosen.includes(first))chosen.push(first);}
for(const c of scores){if(chosen.length>=limit)break;if(!chosen.includes(c))chosen.push(c);}
return chosen.slice(0,limit);
}
export function citation(c){return {id:c.id,programId:c.programIds[0],title:c.title+(c.page?`（PDF ${c.page}${c.pageEnd&&c.pageEnd!==c.page?'〜'+c.pageEnd:''}ページ）`:''),url:c.url+(c.page?`#page=${c.page}`:''),checkedAt:manifest.importedAt,excerpt:c.text};}

export function validateReplyQuotes(reply,docs){const normalize=s=>s.normalize('NFKC').replace(/\s/g,'');const evidence=normalize(docs.map(d=>d.text).join('\n'));return [...reply.matchAll(/[「『]([^」』]+)[」』]/g)].every(m=>evidence.includes(normalize(m[1])));}

export function validateAnswer(reply,docs){if(/https?:\/\/|www\./i.test(reply))return false;const text=docs.map(d=>d.text).join(' ');for(const m of reply.matchAll(/0\d{1,4}[-ー]\d{1,4}[-ー]\d{3,4}/g))if(!text.includes(m[0]))return false;return validateReplyQuotes(reply,docs);}
