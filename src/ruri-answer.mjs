import {citation,validateAnswer} from './rag.mjs';
const evidenceSchema={type:'OBJECT',properties:{chunkId:{type:'STRING'},quote:{type:'STRING'}},required:['chunkId','quote']};
export const ruriAnswerSchema={type:'OBJECT',properties:{status:{type:'STRING',enum:['answered','not_found']},statements:{type:'ARRAY',items:{type:'OBJECT',properties:{text:{type:'STRING'},evidence:{type:'ARRAY',items:evidenceSchema}},required:['text','evidence']}}},required:['status','statements']};
const groundingError=message=>Object.assign(Error(message),{code:'GROUNDING_REJECTED'});
const normalize=text=>text.normalize('NFKC').replace(/\s+/g,'');
export function parseRuriAnswer(json,docs){
 const candidate=json.candidates?.[0];if(candidate?.finishReason!=='STOP')throw Error('Geminiの回答が完了しませんでした。');
 let value;try{value=JSON.parse((candidate.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join(''));}catch{throw Error('回答形式を読み取れませんでした。');}
 if(!['answered','not_found'].includes(value.status)||!Array.isArray(value.statements)||value.statements.length>12)throw Error('回答形式を照合できませんでした。');
 if(value.status==='not_found'){
  if(value.statements.length)throw Error('根拠がない回答に補足説明を追加できません。');
  return {missing:true,reply:'登録資料では確認できません。',statements:[],sources:[],usage:json.usageMetadata||null};
 }
 if(!value.statements.length)throw Error('回答の根拠となる資料がありませんでした。');
 const used=new Map();
 const statements=value.statements.map(statement=>{
  if(typeof statement.text!=='string'||!statement.text.trim()||statement.text.length>600||/[。！？!?].*[^\s。！？!?]/s.test(statement.text)||!Array.isArray(statement.evidence)||!statement.evidence.length)throw groundingError('補足を含め、一文ごとの出典が必要です。');
  const evidence=statement.evidence.map(item=>{
   const doc=docs.find(d=>d.id===item.chunkId);
   if(!doc||typeof item.quote!=='string'||normalize(item.quote).length<8||!normalize(doc.text).includes(normalize(item.quote)))throw groundingError('回答の根拠の引用を資料本文と照合できませんでした。');
   used.set(doc.id,doc);return {chunkId:doc.id,quote:item.quote};
  });
  if(!validateAnswer(statement.text,evidence.map(e=>docs.find(d=>d.id===e.chunkId))))throw groundingError('回答の引用や連絡先を資料と照合できませんでした。');
  return {text:statement.text.trim(),evidence};
 });
 const reply=statements.map(s=>s.text).join('\n');if(reply.length>2500)throw Error('回答が長すぎます。');
 return {reply,statements,sources:[...used.values()].map(citation),usage:json.usageMetadata||null};
}
