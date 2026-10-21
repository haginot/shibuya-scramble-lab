"""Extend the Halloween scene to 3km using licensed PLATEAU Shibuya 2023.

Original crossing extract is never changed. Far buildings retain source IDs,
centres/heights and use bounding-box LOD at rendering time. No invented infill.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile
from fetch_shibuya import RangeZip, PLATEAU, CENTER, POLICY, xy, ROOT

CACHE=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/halloween-regional-source')
CACHE.mkdir(parents=True,exist_ok=True)
ns={'b':'http://www.opengis.net/citygml/building/2.0','g':'http://www.opengis.net/gml'}
records=[];files=[]
with zipfile.ZipFile(RangeZip(PLATEAU,CACHE)) as archive:
    names=[n for n in archive.namelist() if '/bldg/' in n and n.endswith('.gml')]
    for name in names:
        code=Path(name).name[:8]
        if code[:6] not in ('533935','533945'):continue
        if code[:6]=='533935' and int(code[6])<7:continue
        if code[:6]=='533945' and int(code[6])>2:continue
        raw=archive.read(name)
        files.append({'path':name,'sha256':hashlib.sha256(raw).hexdigest()})
        for _,b in ET.iterparse(io.BytesIO(raw),events=('end',)):
            if b.tag!='{'+ns['b']+'}Building':continue
            rings=b.findall('.//b:lod0FootPrint//g:exterior//g:posList',ns) or b.findall('.//b:GroundSurface//g:exterior//g:posList',ns) or b.findall('.//b:lod1Solid//g:exterior//g:posList',ns)
            candidates=[]
            for ring in rings:
                v=list(map(float,ring.text.split()));p=[v[i:i+3] for i in range(0,len(v),3)]
                if not p:continue
                c=[xy(q[0],q[1]) for q in p]
                area=abs(sum(a[0]*d[1]-d[0]*a[1] for a,d in zip(c,c[1:])))/2
                if area>5:candidates.append((min(q[2] for q in p),-area,c))
            if candidates:
                _,_,c=min(candidates,key=lambda t:(round(t[0],1),t[1]))
                cx=sum(p[0] for p in c)/len(c);cz=sum(p[1] for p in c)/len(c)
                if math.hypot(cx,cz)<=3000:
                    h=b.find('b:measuredHeight',ns)
                    height=float(h.text) if h is not None else 9
                    records.append({'id':b.get('{'+ns['g']+'}id'),'ring':c,'height':round(max(2,height),2)})
            b.clear()
        print(name,len(records),'buildings',flush=True)
result={'source':'MLIT Project PLATEAU / Shibuya 2023, modified ground footprints + heights','license':'CC BY 4.0','license_url':'https://creativecommons.org/licenses/by/4.0/','policy_url':POLICY,'url':PLATEAU,'center':CENTER,'radius_m':3000,'units':'metres; x east, z south','processing':'3km radial clip. Ground footprint / measuredHeight. Renderer uses bounding boxes beyond 260m. No invented infill. Only supplied municipal coverage; Omotesando east has no buildings in this extract.','coverage_gaps':['Omotesando eastern area outside supplied Shibuya dataset; shown as an event marker with no invented buildings.'],'files':files,'buildings':records}
for folder in (ROOT/'web3d/data',ROOT/'src/asagaya_town_sim/web3d/data'):
    (folder/'shibuya_halloween_region.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('DONE',len(records),flush=True)
