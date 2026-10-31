#!/usr/bin/env python3
# Summarise a realistic_run.mjs scenario (result.json or partial.json): per route median/worst trip time (censored if unfinished),
# max local density (3x3 m neighbourhood, walkers only) and time fully stopped (<0.1 m/s over 5 s while en route).
import json,sys,os,statistics as st,math
def load(d):
    for n in('result.json','partial.json'):
        p=os.path.join(d,n)
        if os.path.exists(p): return json.load(open(p)),n
def analyze(d):
    r,src=load(d); T=r['tracks']; last=T[-1]['t']; out={'scen':r['SC']['name'],'src':src,'tsim':last,'routes':{}}
    names=list(T[0]['w'].keys())
    for k in names:
        nw=len(T[0]['w'][k]); trips=[];cens=0;stops=[];rmax=0;rho_all=[]
        for j in range(nw):
            born=None;done=None;pos=[];rh=[]
            for row in T:
                w=row['w'][k][j];t=row['t']
                if w[0] is not None:
                    if born is None: born=t
                    pos.append((t,w[0],w[1]));rh.append(w[3] if len(w)>3 and w[3] is not None else 0)
                elif born is not None and done is None: done=t
            if born is None: continue
            if done is None: cens+=1; trips.append(None)
            else: trips.append(done-born)
            # stopped time
            s=0
            for a in range(5,len(pos)):
                dx=pos[a][1]-pos[a-5][1];dz=pos[a][2]-pos[a-5][2]
                if math.hypot(dx,dz)/5<0.1: s+=1
            stops.append(s); rho_all+=rh; rmax=max(rmax,max(rh) if rh else 0)
        fin=sorted(x for x in trips if x is not None)
        # median with censoring: if more than half censored, median > last
        n=len(trips);cen=cens
        allv=sorted([x if x is not None else float('inf') for x in trips]);m=allv[len(allv)//2] if len(allv)%2 else (allv[len(allv)//2-1]+allv[len(allv)//2])/2
        med=None if m==float('inf') else m
        rho_all.sort()
        out['routes'][k]={'n':n,'done':len(fin),'censored':cen,'median_s':med,'median_gt_s':None if med is not None else last,
          'worst_done_s':max(fin) if fin else None,'worst_gt_s':last if cen else None,'fastest_s':min(fin) if fin else None,
          'rho_max':rmax,'rho_p95':rho_all[int(.95*len(rho_all))] if rho_all else 0,
          'stopped_median_s':st.median(stops) if stops else None,'stopped_max_s':max(stops) if stops else None,
          'stopped_you_s':stops[0] if stops else None}
    return out
if __name__=='__main__':
    for d in sys.argv[1:]:
        o=analyze(d);print(json.dumps(o,ensure_ascii=False))
