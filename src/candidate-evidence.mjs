// Minimal recovery facts are used only when their actual conditions are present in
// the retrieved official text. They never assert this person's availability/fees.
function locate(doc,pattern){
 let view='',rawAt=[];let offset=0;
 for(const char of doc.excerpt){const normalized=char.normalize('NFKC');for(let i=0;i<normalized.length;i++)if(!/\s/.test(normalized[i])){view+=normalized[i];rawAt.push(offset);}offset+=char.length;}
 const match=view.match(pattern);if(!match)return null;
 const start=rawAt[match.index],end=rawAt[match.index+match[0].length-1]+1;
 return {sourceId:doc.id,quote:doc.excerpt.slice(Math.max(0,start-100),Math.min(doc.excerpt.length,end+140))};
}
export function candidateEvidence(id,docs){
 const own=docs.filter(d=>d.fullText&&d.url&&d.programIds?.includes(id));
 if(id==='daredemo'){
  const age=own.map(d=>locate(d,/0歳6か月から満3歳未満/)).find(Boolean);
  const enrollment=own.map(d=>locate(d,/通っていない/)).find(Boolean);
  if(age&&enrollment)return{kind:'fact',layout:'bullet',text:'こども誰でも通園制度：保育所等に通っていない0歳6か月から満3歳未満の子どもが対象です。',evidence:[age,enrollment]};
 }
 if(id==='temporary'){
  const reason=own.map(d=>locate(d,/(?:保護者の育児負担の軽減|保護者の心理的・身体的負担を軽減)/)).find(Boolean);
  const care=own.map(d=>locate(d,/乳幼児を一時的に預か/)).find(Boolean);
  if(reason&&care)return{kind:'fact',layout:'bullet',text:'一時預かり事業：保護者の育児負担を軽減するため、乳幼児を一時的に預かる事業です。',evidence:[reason,care]};
 }
 return null;
}
export function findEvidence(docs,id,pattern){
 return docs.filter(d=>d.fullText&&d.url&&d.programIds?.includes(id)).map(d=>locate(d,pattern)).find(Boolean)||null;
}
