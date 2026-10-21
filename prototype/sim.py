"""阿佐ケ谷 町シミュレーション (toy model). python3 sim.py"""
import xml.etree.ElementTree as ET, json, math, random, os, collections
import networkx as nx
LAT0,LON0=35.7047,139.6358; R=400
def dist(a,b):
    dy=(a[0]-b[0])*111320; dx=(a[1]-b[1])*111320*math.cos(math.radians(LAT0)); return math.hypot(dx,dy)
# ---------- 1. OSM ----------
root=ET.parse('osm.xml').getroot()
nodes={n.get('id'):(float(n.get('lat')),float(n.get('lon')),{t.get('k'):t.get('v') for t in n.findall('tag')}) for n in root.findall('node')}
WALK={'primary','secondary','tertiary','residential','unclassified','pedestrian','living_street','footway','service','path','steps','tertiary_link','secondary_link'}
G=nx.Graph(); feats=[]; pois=[]
CAT={'cafe':'cafe','restaurant':'food','fast_food':'food','bar':'bar','pub':'bar','izakaya':'bar','school':'school','kindergarten':'school','college':'school','library':'library','clinic':'clinic','doctors':'clinic','hospital':'clinic','pharmacy':'shop','bank':'service','post_office':'service','place_of_worship':'park'}
def classify(t):
    a=t.get('amenity')
    if a in CAT: return CAT[a]
    s=t.get('shop')
    if s in ('supermarket','convenience','greengrocer','butcher','bakery','deli'): return 'grocery'
    if s: return 'shop'
    if t.get('leisure') in ('park','playground') or t.get('landuse')=='grass': return 'park'
    return None
for w in root.findall('way'):
    t={x.get('k'):x.get('v') for x in w.findall('tag')}; nds=[x.get('ref') for x in w.findall('nd') if x.get('ref') in nodes]
    if not nds: continue
    if t.get('highway') in WALK:
        coords=[[nodes[i][1],nodes[i][0]] for i in nds]
        feats.append({'type':'Feature','properties':{'kind':'street','highway':t['highway'],'name':t.get('name','')},'geometry':{'type':'LineString','coordinates':coords}})
        for a,b in zip(nds,nds[1:]): G.add_edge(a,b,length=dist(nodes[a],nodes[b]),name=t.get('name',''))
    c=classify(t)
    if c and t.get('name'):
        la=sum(nodes[i][0] for i in nds)/len(nds); lo=sum(nodes[i][1] for i in nds)/len(nds)
        pois.append(dict(name=t['name'],cat=c,lat=la,lon=lo))
for i,(la,lo,t) in nodes.items():
    c=classify(t)
    if c and t.get('name'): pois.append(dict(name=t['name'],cat=c,lat=la,lon=lo))
    if t.get('railway')=='station' or (t.get('public_transport')=='station' and '阿佐' in t.get('name','')):
        pois.append(dict(name=t.get('name','駅'),cat='station',lat=la,lon=lo))
pois=[p for p in pois if dist((p['lat'],p['lon']),(LAT0,LON0))<=R]
st=[p for p in pois if p['cat']=='station' and '阿佐' in p['name']]
if not st: pois.append(dict(name='阿佐ケ谷駅',cat='station',lat=LAT0,lon=LON0)); st=pois[-1:]
STATION=st[0]; pois=[p for p in pois if p['cat']!='station']+[STATION]
G=G.subgraph(max(nx.connected_components(G),key=len)).copy()
GN=list(G.nodes)
def nearest(la,lo): return min(GN,key=lambda n:dist(nodes[n],(la,lo)))
GN_in=[n for n in GN if dist(nodes[n],(LAT0,LON0))<R]
GN=GN_in
for k,p in enumerate(pois): p['id']=k; p['node']=nearest(p['lat'],p['lon'])
gj={'type':'FeatureCollection','features':feats+[{'type':'Feature','properties':{'kind':'poi',**{k:v for k,v in p.items() if k not in('lat','lon')}},'geometry':{'type':'Point','coordinates':[p['lon'],p['lat']]}} for p in pois]}
json.dump(gj,open('asagaya_osm.geojson','w'),ensure_ascii=False)
print('streets',len(feats),'graph nodes',G.number_of_nodes(),'pois',collections.Counter(p['cat'] for p in pois))
# ---------- 2. agents ----------
PERSONAS=[('会社員',6),('子育て世帯',4),('学生',4),('高齢者',4),('在宅ワーカー',2)]
NAMES=['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T']
def make_agents(seed):
    rnd=random.Random(seed); ag=[]; k=0
    for per,n in PERSONAS:
        for _ in range(n):
            home=rnd.choice(GN); ag.append(dict(id=k,name=f'住民{NAMES[k]}',persona=per,home=home,seed=rnd.random())); k+=1
    return ag
def plan(a,rnd,sc):
    """returns list of (start_min, category, dwell) — rule-based/probabilistic"""
    p=a['persona']; rain=sc.get('rain'); P=[]
    def maybe(pr,t,cat,d):
        if rain and cat=='park': pr*=0.15
        if rain and cat in('shop','cafe'): pr*=0.7
        if rnd.random()<pr: P.append((t+rnd.randint(-20,20),cat,d))
    if p=='会社員':
        maybe(.6,7*60+30,'cafe',10); P.append((8*60+rnd.randint(0,30),'station',600)); maybe(.5,19*60+10,'grocery',15); maybe(.35,19*60+40,'bar',90); maybe(.3,19*60+30,'food',50)
    elif p=='子育て世帯':
        P.append((8*60,'school',5)); maybe(.7,10*60,'grocery',30); maybe(.6,15*60,'school',5); maybe(.7,15*60+20,'park',60); maybe(.3,12*60,'cafe',45); maybe(.3,17*60,'shop',20)
    elif p=='学生':
        P.append((8*60+30,'station',420)); maybe(.5,16*60+30,'food',40); maybe(.4,17*60+30,'cafe',80); maybe(.3,20*60,'shop',20); maybe(.2,21*60,'bar',90)
    elif p=='高齢者':
        maybe(.8,6*60+30,'park',40); maybe(.6,9*60+30,'clinic',60); maybe(.8,11*60,'grocery',30); maybe(.4,14*60,'cafe',50); maybe(.3,15*60,'library',90)
    else:
        maybe(.7,10*60,'cafe',150); maybe(.6,12*60+30,'food',45); maybe(.5,15*60,'park',30); maybe(.5,18*60,'grocery',20)
    if sc.get('event_poi') and (p!='会社員' or rnd.random()<.2):
        if rnd.random()<.55: P.append((rnd.randint(13*60,16*60),'event',rnd.randint(30,90)))
    P.sort(); return P
def choose(cat,frm,rnd,sc,poilist):
    if cat=='event': return sc['event_poi']
    if cat=='station': return STATION
    cands=[p for p in poilist if p['cat']==cat] or [p for p in poilist if p['cat']=='shop']
    beta=1/120 if sc.get('rain') else 1/200   # 雨天は距離抵抗が大きい
    w=[math.exp(-beta*dist(nodes[frm],(p['lat'],p['lon'])))*p.get('attr',1.0) for p in cands]
    return rnd.choices(cands,w)[0]
def path(a,b):
    try: return nx.shortest_path(G,a,b,weight='length')
    except nx.NetworkXNoPath: return [a,b]
def simulate(sc,seed,record=False):
    rnd=random.Random(seed*7+1); poilist=list(pois)
    if sc.get('newcafe'): poilist=poilist+[sc['newcafe']]
    speed=65 if sc.get('rain') else 80
    visits=collections.Counter(); dwell=collections.defaultdict(list); edges=collections.Counter(); tracks={}; walk=0
    for a in make_agents(seed):
        cur=a['home']; t=6*60; frames=[]  # minute-level position timeline
        pos=lambda n:(round(nodes[n][0],6),round(nodes[n][1],6))
        def stay(until,n,label):
            nonlocal t
            while t<until: frames.append((t,)+pos(n)+(label,)); t+=1
        legs=plan(a,rnd,sc)+[(23*60,'home',0)]
        for st0,cat,d in legs:
            if st0<t: st0=t
            stay(min(st0,24*60),cur,'自宅' if cur==a['home'] else '滞在')
            if cat=='home': tgt=None; dst=a['home']; label='自宅'
            else: tgt=choose(cat,cur,rnd,sc,poilist); dst=tgt['node']; label=tgt['name']
            pth=path(cur,dst); acc=0
            for u,v in zip(pth,pth[1:]):
                L=G[u][v]['length'] if G.has_edge(u,v) else dist(nodes[u],nodes[v]); edges[tuple(sorted((u,v)))]+=1; walk+=L
                acc+=L
                while acc>=speed: frames.append((t,)+pos(v)+('移動中',)); t+=1; acc-=speed
            cur=dst
            if tgt:
                if cat=='station' and d>300:  # 電車で外出
                    t2=t+d; stay(t,cur,'駅'); 
                    while t<t2: frames.append((t,None,None,'外出中')); t+=1
                else:
                    dd=int(d*(0.8 if sc.get('rain') else 1)*rnd.uniform(.7,1.3)); visits[tgt['name']]+=1; dwell[tgt['cat']].append(dd); stay(t+dd,cur,label)
        stay(24*60,cur,'自宅')
        if record: tracks[a['id']]=dict(name=a['name'],persona=a['persona'],f=[[f[1],f[2],f[3]] for f in frames if f[0]%2==0 and f[0]<24*60])
    return dict(visits=visits,dwell=dwell,edges=edges,tracks=tracks,walk=walk)
cafe_node=nearest(STATION['lat']+0.0006,STATION['lon']+0.0003)
SC={'baseline':{},
    'newcafe':{'newcafe':dict(id=-1,name='★新カフェ(仮想)',cat='cafe',lat=nodes[cafe_node][0],lon=nodes[cafe_node][1],node=cafe_node,attr=3.0)},
    'event':{'event_poi':dict(id=-2,name='★駅前イベント(仮想)',cat='event',lat=STATION['lat'],lon=STATION['lon'],node=STATION['node'])},
    'rain':{'rain':True}}
JP={'baseline':'ベースライン','newcafe':'(a) 駅前に新カフェ','event':'(b) 駅前イベント(午後)','rain':'(c) 雨の日'}
N=30; results={}
for k,sc in SC.items():
    agg=dict(visits=collections.Counter(),dwell=collections.defaultdict(list),edges=collections.Counter(),walk=0)
    for s in range(N):
        r=simulate(sc,s); agg['visits'].update(r['visits']); agg['edges'].update(r['edges']); agg['walk']+=r['walk']
        for c,v in r['dwell'].items(): agg['dwell'][c]+=v
    agg['tracks']=simulate(sc,0,record=True)['tracks']; results[k]=agg
# ---------- 3. metrics ----------
def cat_of(name):
    for p in pois+[SC['newcafe']['newcafe'],SC['event']['event_poi']]:
        if p['name']==name: return p['cat']
def catvisits(r):
    c=collections.Counter()
    for n,v in r['visits'].items(): c[cat_of(n)]+=v/N
    return c
near=set(n for n in G.nodes if dist(nodes[n],(STATION['lat'],STATION['lon']))<120)
summary={}
for k,r in results.items():
    cv=catvisits(r); st_tr=sum(v for e,v in r['edges'].items() if e[0] in near or e[1] in near)/N
    summary[k]=dict(visits_total=round(sum(r['visits'].values())/N,1),by_cat={c:round(v,2) for c,v in cv.items()},
        dwell_mean={c:round(sum(v)/len(v),1) for c,v in r['dwell'].items() if v},walk_km_per_agent=round(r['walk']/N/20/1000,2),
        station_area_edge_traversals=round(st_tr,1),top_pois=[(n,round(v/N,2)) for n,v in r['visits'].most_common(8)],virtual={n:round(v/N,2) for n,v in r['visits'].items() if '★' in n},cafe_top=[(n,round(v/N,2)) for n,v in r['visits'].most_common() if cat_of(n)=='cafe'][:4])
json.dump(summary,open('results.json','w'),ensure_ascii=False,indent=1)
for k,v in summary.items(): print(k,json.dumps(v,ensure_ascii=False))
# ---------- 4. PNGs ----------
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager
for f in font_manager.findSystemFonts():
    if any(x in f for x in ('NotoSansCJK','NotoSansJP','IPAex','IPAGothic','TakaoP')): font_manager.fontManager.addfont(f); plt.rcParams['font.family']=font_manager.FontProperties(fname=f).get_name(); break
cats=['cafe','food','bar','grocery','shop','park','school','clinic','library','event']
fig,ax=plt.subplots(1,3,figsize=(17,5))
import numpy as np; x=np.arange(len(cats)); w=.2
for i,k in enumerate(SC): ax[0].bar(x+i*w,[summary[k]['by_cat'].get(c,0) for c in cats],w,label=JP[k])
ax[0].set_xticks(x+.3); ax[0].set_xticklabels(cats,rotation=45); ax[0].set_title(f'カテゴリ別 訪問数/日 ({N}試行平均)'); ax[0].legend()
ax[1].bar([JP[k] for k in SC],[summary[k]['station_area_edge_traversals'] for k in SC],color='C1'); ax[1].set_title('駅前120m圏 道路区間の通過回数/日'); ax[1].tick_params(axis='x',rotation=20)
dc=['cafe','food','bar','park','grocery']
for i,k in enumerate(SC): ax[2].bar(np.arange(len(dc))+i*w,[summary[k]['dwell_mean'].get(c,0) for c in dc],w,label=JP[k])
ax[2].set_xticks(np.arange(len(dc))+.3); ax[2].set_xticklabels(dc); ax[2].set_title('平均滞在時間(分)'); ax[2].legend()
plt.suptitle('阿佐ケ谷 町シミュレーション (トイモデル・予測ではありません)'); plt.tight_layout(); plt.savefig('summary.png',dpi=110)
fig,ax=plt.subplots(figsize=(9,9)); E=results['baseline']['edges']; mx=max(E.values())
for u,v in G.edges: ax.plot([nodes[u][1],nodes[v][1]],[nodes[u][0],nodes[v][0]],color='#ccc',lw=.6,zorder=1)
for (u,v),c in E.items(): ax.plot([nodes[u][1],nodes[v][1]],[nodes[u][0],nodes[v][0]],color=plt.cm.inferno_r(.2+.8*c/mx),lw=1+5*c/mx,zorder=2)
col={'cafe':'brown','food':'orange','bar':'purple','grocery':'green','shop':'blue','park':'lime','school':'red','clinic':'pink','library':'cyan','station':'black'}
for p in pois: ax.scatter(p['lon'],p['lat'],s=60 if p['cat']=='station' else 12,c=col.get(p['cat'],'gray'),zorder=3)
ax.annotate('阿佐ケ谷駅',(STATION['lon'],STATION['lat']),fontsize=12,weight='bold')
ax.set_xlim(LON0-.0047,LON0+.0047); ax.set_ylim(LAT0-.0038,LAT0+.0038); ax.set_aspect(1/math.cos(math.radians(LAT0)))
ax.set_title('ベースライン: 道路区間別の歩行者通過量 (30試行累計) と POI'); ax.axis('off'); fig.text(.5,.015,'© OpenStreetMap contributors · ODbL 1.0 · https://www.openstreetmap.org/copyright',ha='center',fontsize=8)
plt.tight_layout(rect=(0,.04,1,1)); plt.savefig('map.png',dpi=110)
# ---------- 5. HTML ----------
data=dict(center=[LAT0,LON0],station=STATION,pois=[{k:p[k] for k in('name','cat','lat','lon')} for p in pois],
  scenarios={k:dict(label=JP[k],tracks=results[k]['tracks'],extra=[SC[k][x] for x in('newcafe','event_poi') if x in SC[k]] and [{kk:SC[k][x][kk] for kk in('name','cat','lat','lon')} for x in('newcafe','event_poi') if x in SC[k]],
    heat=[[nodes[u][0],nodes[u][1],nodes[v][0],nodes[v][1],c] for (u,v),c in results[k]['edges'].items()],summary=summary[k]) for k in SC})
html=open('template.html',encoding='utf-8').read().replace('__DATA__',json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<', '\\u003c'))
open('index.html','w',encoding='utf-8').write(html); print('done')
