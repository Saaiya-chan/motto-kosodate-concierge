"""Rebuild the local index without downloading sources."""
from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'data/source-manifest.json').read_text());chunks=[]
for source in manifest['sources']:
 path=root/'data'/source['file'];pages=path.with_suffix('.txt').read_text().split('\f');is_pdf=path.suffix=='.pdf';count=0
 if is_pdf:pages=[re.sub(r'\n\s*\d+\s*$','',page) for page in pages]
 for no,page in enumerate(pages,1):
  clean=re.sub(r'[ \t]+',' ',page).strip()
  for start in range(0,len(clean),650):
   core=clean[start:start+850]
   if len(core.strip())<40:continue
   count+=1;before=clean[max(0,start-160):start];after=clean[start+850:start+1010];first=no;last=no
   if start==0 and no>1:
    before=re.sub(r'[ \t]+',' ',pages[no-2]).strip()[-160:]+'\n';first=no-1
   if start+850>=len(clean) and no<len(pages) and pages[no].strip():
    after='\n'+re.sub(r'[ \t]+',' ',pages[no]).strip()[:160];last=no+1
   chunks.append({'id':f"{source['id']}-{count:03d}",'sourceId':source['id'],'programIds':source['programIds'],'title':source['title'],'url':source['url'],'page':first if is_pdf else None,'pageEnd':last if is_pdf else None,'text':before+core+after})
 source['chunks']=count
(root/'data/source-chunks.json').write_text(json.dumps(chunks,ensure_ascii=False,indent=2)+'\n')
(root/'data/source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(len(chunks),'context-preserving chunks')
