"""Create SUMO trajectories on the bundled OSM roads (no runtime SUMO needed).

uv run --with eclipse-sumo --with traci --with sumolib --with pyproj python tools/export_shibuya_traffic.py
Uses a deliberately assumed 150 s plan. Public signal timings and traffic counts
are unavailable. All signals are red during pedestrian and clearance phases.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SCRAMBLE_RADIUS = 30  # metres; covers the six crossing corners
YELLOW_AT = 137.0  # seconds into the 150 s cycle
STOP_BUFFER = 6.0  # metres between a stop line and the scramble polygon (walkers use up to 2.5 m)
CORNERS = [[-28,-14],[-5,-22],[21,-7],[18,12],[5,20],[-23,14]]  # same as web3d/shibuya/simulation.mjs


def inside(x,z,ring):
    hit=False
    for i in range(len(ring)):
        a,b=ring[i],ring[i-1]
        if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]: hit=not hit
    return hit


def seg_dist(x,z,a,b):
    dx,dz=b[0]-a[0],b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)))
    return math.hypot(a[0]+dx*t-x,a[1]+dz*t-z)
sys.path.insert(0,str(ROOT/'src'))
from asagaya_town_sim.shibuya import CENTER, load, latlon


def export(work):
    import sumolib
    import traci
    data = load('shibuya_osm.json')
    osm = ET.Element('osm',version='0.6',generator='Shibuya public-data toy')
    nodes, ways = {}, []
    for road in data['roads']:
        if road['kind'] not in ('primary','secondary','tertiary','unclassified','residential','service','primary_link','secondary_link','tertiary_link'): continue
        for node,p in zip(road['nodes'],road['points']): nodes[node] = p
        ways.append(road)
    central = [str(n) for n,p in nodes.items() if math.hypot(*p)<12]
    for n,p in nodes.items():
        lat,lon=latlon(*p)
        ET.SubElement(osm,'node',id=str(n),lat=str(lat),lon=str(lon),version='1')
    for road in ways:
        way=ET.SubElement(osm,'way',id=str(road['id']),version='1')
        for n in road['nodes']: ET.SubElement(way,'nd',ref=str(n))
        for k,v in road['tags'].items(): ET.SubElement(way,'tag',k=k,v=v)
    ET.ElementTree(osm).write(work/'roads.osm',encoding='utf-8',xml_declaration=True)
    netfile=work/'shibuya.net.xml'
    command=[sumolib.checkBinary('netconvert'),'--osm-files',str(work/'roads.osm'),'--output-file',str(netfile),'--tls.set',','.join(central),'--tls.join','true','--tls.join-dist','35','--no-turnarounds','true','--junctions.corner-detail','5','--geometry.remove','true','--default.speed','8.33','--no-warnings','true']
    subprocess.run(command,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    # Second pass: merge every junction node inside the scramble into ONE node so
    # stop lines sit at its outer edge, never inside the all-way pedestrian area.
    first=sumolib.net.readNet(str(netfile))
    def local(x,y):
        lon,lat=first.convertXY2LonLat(x,y)
        return (lon-CENTER[1])*111320*math.cos(math.radians(CENTER[0])),-(lat-CENTER[0])*111320
    inner=[n.getID() for n in first.getNodes() if math.hypot(*local(*n.getCoord()))<SCRAMBLE_RADIUS]
    joins=ET.Element('nodes');ET.SubElement(joins,'join',nodes=' '.join(inner))
    ET.ElementTree(joins).write(work/'join.nod.xml',encoding='utf-8',xml_declaration=True)
    base=[c for c in command if c!=','.join(central)]
    base=[c for i,c in enumerate(base) if not (c=='--tls.set')]
    subprocess.run(base+['--node-files',str(work/'join.nod.xml')],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    joined=sumolib.net.readNet(str(netfile))
    hub=min(joined.getNodes(),key=lambda n:math.hypot(*local(*n.getCoord())))
    # Third pass: signalise the merged node.
    subprocess.run(base+['--node-files',str(work/'join.nod.xml'),'--tls.set',hub.getID()],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    # Fourth pass: move each incoming stop line back (edge endOffset) until it is
    # outside the scramble polygon plus a buffer, so waiting cars never stand in
    # the area pedestrians use during the all-way walk.
    signalled=sumolib.net.readNet(str(netfile))
    def in_scramble(x,z,buffer=STOP_BUFFER):
        if inside(x,z,CORNERS): return True
        return any(seg_dist(x,z,CORNERS[i],CORNERS[(i+1)%len(CORNERS)])<buffer for i in range(len(CORNERS)))
    patch=ET.Element('edges')
    for edge in signalled.getNode(hub.getID()).getIncoming():
        shape=[local(*p) for p in edge.getLanes()[0].getShape()]
        back=0.0
        for (x1,z1),(x0,z0) in zip(reversed(shape),list(reversed(shape))[1:]):
            seg=math.hypot(x1-x0,z1-z0);steps=max(1,int(seg/.5))
            done=False
            for k in range(steps+1):
                x=x1+(x0-x1)*k/steps;z=z1+(z0-z1)*k/steps
                if not in_scramble(x,z): done=True;break
            if done: back+=math.hypot(x-x1,z-z1);break
            back+=seg
        if back>0: ET.SubElement(patch,'edge',id=edge.getID(),endOffset=f'{min(back,edge.getLength()-3):.2f}')
    ET.ElementTree(patch).write(work/'stoplines.edg.xml',encoding='utf-8',xml_declaration=True)
    subprocess.run([sumolib.checkBinary('netconvert'),'-s',str(netfile),'-e',str(work/'stoplines.edg.xml'),'-o',str(netfile),'--no-warnings','true'],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    net=sumolib.net.readNet(str(netfile))
    edges=[e for e in net.getEdges() if e.allows('passenger') and e.getLength()>35]
    rng=random.Random(7)
    routes=[]
    # Prefer paths traversing the central junction, not disconnected peripheral roads.
    for _ in range(1800):
        a,b=rng.sample(edges,2)
        path,cost=net.getShortestPath(a,b,vClass='passenger')
        if path and len(path)>2:
            # Test geographic distance of an actual SUMO path point to the crossing.
            near=False
            for e in path:
                for x,y in e.getShape():
                    lon,lat=net.convertXY2LonLat(x,y)
                    if math.hypot((lon-CENTER[1])*90500,(lat-CENTER[0])*111320)<35: near=True
            if near: routes.append([e.getID() for e in path])
        if len(routes)>=100: break
    if not routes: raise RuntimeError('No connected central OSM vehicle routes')
    route_root=ET.Element('routes')
    ET.SubElement(route_root,'vType',id='car',accel='2',decel='4.5',sigma='0.25',length='4.5',maxSpeed='8.33')
    for i,route in enumerate(routes): ET.SubElement(route_root,'route',id=f'r{i}',edges=' '.join(route))
    for i in range(240): ET.SubElement(route_root,'vehicle',id=f'c{i}',type='car',route=f'r{i%len(routes)}',depart=str(i*1.8),departLane='best')
    ET.ElementTree(route_root).write(work/'routes.rou.xml',encoding='utf-8',xml_declaration=True)
    traci.start([sumolib.checkBinary('sumo'),'-n',str(netfile),'-r',str(work/'routes.rou.xml'),'--step-length','0.5','--seed','7','--no-step-log','true','--no-warnings','true','--time-to-teleport','-1'])
    tracks={}
    try:
        ids=traci.trafficlight.getIDList()
        programs={i:traci.trafficlight.getAllProgramLogics(i)[0] for i in ids}
        for step in range(900):
            t=step*.5
            phase=t%150
            for signal in ids:
                if phase<75 or phase>=140:
                    traci.trafficlight.setRedYellowGreenState(signal,'r'*len(traci.trafficlight.getRedYellowGreenState(signal)))
                elif phase==75:
                    traci.trafficlight.setProgram(signal,programs[signal].programID)
                    traci.trafficlight.setPhase(signal,0)
                elif phase==YELLOW_AT:
                    # Yellow, then the 10 s all-red lets vehicles inside clear the junction.
                    state=traci.trafficlight.getRedYellowGreenState(signal)
                    traci.trafficlight.setRedYellowGreenState(signal,''.join('y' if c in 'Gg' else c for c in state))
            traci.simulationStep()
            if t<300: continue
            for v in traci.vehicle.getIDList():
                x,y=traci.vehicle.getPosition(v)
                lon,lat=net.convertXY2LonLat(x,y)
                x=(lon-CENTER[1])*111320*math.cos(math.radians(CENTER[0]));z=-(lat-CENTER[0])*111320
                tracks.setdefault(v,[]).append([round(t+.5-300,1),round(x,2),round(z,2),round(traci.vehicle.getAngle(v),1)])
        version=traci.getVersion()[1]
    finally: traci.close()
    return {'model':'SUMO on OSM network', 'sumo_version':version, 'source':'© OpenStreetMap contributors; generated with Eclipse SUMO (EPL-2.0)', 'license':'ODbL 1.0 (OSM-derived trajectories); MIT generation code', 'license_url':'https://opendatacommons.org/licenses/odbl/1-0/','copyright_url':'https://www.openstreetmap.org/copyright','input_data':'shibuya_osm.json','seed':7,'cycle_s':150,'sample_step_s':0.5,'signal':{'pedestrian':[0,55],'clearance':[55,75],'vehicle':[75,140],'all_red':[140,150]},'note':'Assumed traffic demand, turning choices and controller plan. Junction nodes within 30 m of the crossing are joined into one node and every incoming stop line is set back (endOffset) to 6 m outside the scramble polygon, so waiting vehicles never stand in the pedestrian area. Yellow 137-140 s, then all red; all central signals held red in the pedestrian phase. Two-cycle warmup. Browser additionally freezes the traffic clock if pedestrians overrun clearance. Cycle wrap is a replay cut, not continuous vehicle identities.', 'network':{'junctions':len(net.getNodes()),'edges':len(net.getEdges()),'signals':len(ids),'routes':len(routes)}, 'tracks':[{'id':k,'frames':v} for k,v in tracks.items() if len(v)>1]}


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--work',type=Path)
    ap.add_argument('--out',type=Path,help='write shibuya_traffic.json here instead of the bundled data')
    args=ap.parse_args()
    with tempfile.TemporaryDirectory(prefix='shibuya-sumo-') as temp:
        work=args.work or Path(temp);work.mkdir(parents=True,exist_ok=True)
        data=export(work)
        for base in [args.out] if args.out else (ROOT/'web3d/data',ROOT/'src/asagaya_town_sim/web3d/data'):
            (base/'shibuya_traffic.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        print(data['model'],data['network'],len(data['tracks']))


if __name__=='__main__': main()
