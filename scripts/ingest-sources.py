"""Explicit maintenance command. Downloads official sources; never used during a consultation."""
from pathlib import Path
import json,hashlib,urllib.request,subprocess,re,html
from datetime import datetime
from zoneinfo import ZoneInfo
TODAY=datetime.now(ZoneInfo("Asia/Tokyo")).date().isoformat()
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1]
ASSETS='https://www.cfa.go.jp/assets/contents/node/basic_page/field_ref_resources/'
sources=[
('temporary',['temporary'],'一時預かり・国の制度説明','https://kokasen.cfa.go.jp/support-programs'),
('daredemo',['daredemo'],'こども誰でも通園・公式利用案内','https://www.daretsu.cfa.go.jp/'),
('famisapo',['famisapo'],'ファミリー・サポート・センター概要（令和8年度）',ASSETS+'e18b0699-53bd-4d02-bd42-f7ebb30c362b/68cb826c/20260612_policies_kosodateshien_family-support_12.pdf'),
('shortstay',['shortstay','twilight'],'子育て短期支援事業実施要綱（令和8年4月）',ASSETS+'8a43806e-f35e-4d12-b712-d3f9f6344c9f/5a002224/20260423_policies_kosodateshien_jido-short_29.pdf'),
('shortstay-faq',['shortstay','twilight'],'子育て短期支援事業FAQ（第3版・令和7年9月更新）',ASSETS+'8a43806e-f35e-4d12-b712-d3f9f6344c9f/a71715ca/20250911_policies_kosodateshien_jido-short_17.pdf'),
('home-help',['home-help'],'子育て世帯訪問支援事業ガイドライン',ASSETS+'91f57176-a420-4d1d-8973-1828437e0aa8/d9bc9e4f/20240904_policies_kosodateshien_jido-homon_03.pdf'),
('postpartum',['postpartum'],'産後ケア事業ガイドライン（令和8年3月）',ASSETS+'ff38becb-bbd1-41f3-a95e-3a22ddac09d8/317bd576/20260331_policies_boshihoken_173.pdf'),
('sickcare',['sickcare'],'病児保育等の基礎資料（令和8年4月）',ASSETS+'e4b817c9-5282-4ccc-b0d5-ce15d7b5018c/07b4e1a1/20260401_policies_hoiku_209.pdf'),
('singleparent',['singleparent'],'ひとり親家庭等日常生活支援事業','https://www.cfa.go.jp/policies/hitori-oya/hitorioya-seikatsu-shien'),
('visit-advice',['visit-advice'],'家庭支援事業・養育支援訪問','https://www.cfa.go.jp/policies/katei_shien'),
('hiroba',['hiroba'],'地域子育て支援拠点事業概要',ASSETS+'321a8144-83b8-4467-b70e-89aa4a5e6735/d36734ea/20250714_policies_kosodateshien_shien-kyoten_36.pdf')]
class Text(HTMLParser):
 def __init__(self):super().__init__();self.hidden=0;self.parts=[]
 def handle_starttag(self,tag,attrs):
  if tag in ('script','style','nav','header','footer'):self.hidden+=1
  if tag in ('p','div','li','h1','h2','h3','h4','br','section'):self.parts.append('\n')
 def handle_endtag(self,tag):
  if tag in ('script','style','nav','header','footer'):self.hidden=max(0,self.hidden-1)
 def handle_data(self,data):
  if not self.hidden:self.parts.append(data)
def download(url):
 req=urllib.request.Request(url,headers={'User-Agent':'motto-local-source-import/0.2'})
 with urllib.request.urlopen(req,timeout=60) as r:
  if not r.url.startswith('https://') or not urllib.parse.urlparse(r.url).hostname.endswith('cfa.go.jp'):raise ValueError('non-official redirect')
  return r.read()
# Resolve the handbook from the official landing page rather than guessing an asset URL.
landing=download('https://www.cfa.go.jp/policies/hoiku/daredemo-tsuen/').decode()
for href,label in re.findall(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>',landing,re.S):
 if 'こども誰でも通園制度の実施に関する手引' in re.sub('<[^>]+>','',label):
  sources.append(('daredemo-handbook',['daredemo'],'こども誰でも通園制度の実施に関する手引',urllib.parse.urljoin('https://www.cfa.go.jp',html.unescape(href))));break
manifest=[];chunks=[]
for ident,programs,title,url in sources:
 data=download(url);ext='pdf' if data.startswith(b'%PDF') else 'html';path=ROOT/'data/documents'/f'{ident}.{ext}';path.write_bytes(data)
 if ext=='pdf':
  textpath=path.with_suffix('.txt');subprocess.run(['pdftotext','-layout',str(path),str(textpath)],check=True);pages=textpath.read_text().split('\f')
 else:
  parser=Text();parser.feed(data.decode('utf-8'));plain=''.join(parser.parts);plain=re.sub(r'\n\s*\n+','\n\n',plain);pages=[plain];path.with_suffix('.txt').write_text(plain)
 count=0
 for page_no,page in enumerate(pages,1):
  clean=re.sub(r'[ \t]+',' ',page).strip()
  # Overlap retains sentences spanning a chunk boundary. PDF physical page numbers are preserved.
  for start in range(0,len(clean),650):
   part=clean[start:start+850]
   if len(part.strip())<40:continue
   count+=1;chunks.append({'id':f'{ident}-{count:03d}','sourceId':ident,'programIds':programs,'title':title,'url':url,'page':page_no if ext=='pdf' else None,'text':part})
 manifest.append({'id':ident,'programIds':programs,'title':title,'url':url,'downloadedAt':TODAY,'file':f'documents/{path.name}','sha256':hashlib.sha256(data).hexdigest(),'pages':len([p for p in pages if p.strip()]),'chunks':count})
 print(ident,len(data),'bytes',count,'chunks',flush=True)
 if count==0:raise ValueError('no readable text: '+ident)
(ROOT/'data/source-manifest.json').write_text(json.dumps({'importedAt':TODAY,'sources':manifest},ensure_ascii=False,indent=2)+'\n')
(ROOT/'data/source-chunks.json').write_text(json.dumps(chunks,ensure_ascii=False,indent=2)+'\n')
print('TOTAL',len(manifest),'sources',len(chunks),'chunks')

subprocess.run(['python3',str(ROOT/'scripts/reindex-sources.py')],check=True)
