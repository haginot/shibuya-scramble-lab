"""Offline Shibuya configuration and exports. Physical agents run in the browser.

Station passenger events are a scale proxy, never unique street pedestrians.
The historical Asagaya implementation is deliberately left separate.
"""
from __future__ import annotations

import json
import math
from importlib import resources
from pathlib import Path

DISCLAIMER = '公開統計の規模・時間帯を参考にしたトイモデル・予測ではない / Toy model scaled to public ridership stats — not a prediction; 横断量・行動は未較正 / crossings and behaviour uncalibrated'
CENTER = [35.65948, 139.70055]
STORE = [-46.0, -42.0]


def load(name):
    return json.loads(resources.files('asagaya_town_sim').joinpath('web3d/data', name).read_text(encoding='utf-8'))


def latlon(x, z):
    return [CENTER[0]-z/111320, CENTER[1]+x/(111320*math.cos(math.radians(CENTER[0])))]


def config(agents=20000, seed=7, hour=15, peak=True):
    if not isinstance(agents,int) or not 0 <= agents <= 60000:
        raise ValueError('agents must be an integer between 0 and 60000')
    if not 0 <= hour < 24:
        raise ValueError('hour must be in [0,24)')
    calibration = load('shibuya_calibration.json')
    return dict(area='shibuya', available_areas=['shibuya','asagaya'], agents=agents,
                seed=seed, hour=hour, peak=peak, center=CENTER, store=dict(name='架空カフェ「ひだまり珈琲」 / fictional Hidamari Coffee', position=STORE),
                disclaimer=DISCLAIMER, calibration=calibration, simulation='individual social-force agents; browser worker; 1 metre = 1 world unit',
                traffic=load('shibuya_traffic.json')['model'])


def demand(hour=15, peak=False):
    c = load('shibuya_calibration.json')
    curve = c['hourly_weights']
    value = curve[int(hour)]*(1-hour%1)+curve[(int(hour)+1)%24]*(hour%1)
    # Normalise again after interpolation: discrete weights describe hour bins.
    hourly = c['station_event_proxy']*c['street_capture_assumption']*value/sum(curve)
    if peak:
        hourly *= c['peak_phase_target']/(c['station_event_proxy']*c['street_capture_assumption']*max(curve)/sum(curve)*c['signal']['cycle_s']/3600)
    return hourly*c['signal']['cycle_s']/3600


class PromoTown:
    """OSM map adapter for the existing, explicitly fictional 14-day funnel."""
    def __init__(self):
        d = load('shibuya_osm.json')
        self.coord, self.adj, index = [], {}, {}
        for road in d['roads']:
            if road['kind'] in ('motorway','trunk','motorway_link'): continue
            ids = []
            for x,z in road['points']:
                p = tuple(latlon(x,z))
                if p not in index:
                    index[p] = len(self.coord)
                    self.coord.append(p)
                ids.append(index[p])
            for a,b in zip(ids,ids[1:]):
                self.adj.setdefault(a,{})[b] = 1
                self.adj.setdefault(b,{})[a] = 1
        self.nodes = list(self.adj)
        target = latlon(*STORE)
        self.site_node = len(self.coord)
        self.coord.append(target)
        self.home_nodes = [i for i,p in enumerate(self.coord[:-1]) if math.hypot((p[0]-CENTER[0])*111320,(p[1]-CENTER[1])*90500) > 70]
        self.station = dict(name='渋谷駅 / Shibuya',lat=CENTER[0],lon=CENTER[1])
        self.pois = [dict(id=s['id'],name=s['name'],cat=s['kind'],lat=latlon(*s['position'])[0],lon=latlon(*s['position'])[1]) for s in d['shops']]


def promo_assets(directory):
    """Map adapter: component licenses remain explicit within the mixed file."""
    directory = Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    buildings = load('shibuya_plateau.json')
    osm = load('shibuya_osm.json')
    b = dict(origin=CENTER, component_licenses={'buildings':{'source':'MLIT Project PLATEAU / Shibuya City 2023; modified footprints + heights','license':'CC BY 4.0','license_url':'https://creativecommons.org/licenses/by/4.0/'},'rails':{'source':'© OpenStreetMap contributors; derived from shibuya_osm.json','license':'ODbL 1.0','license_url':'https://opendatacommons.org/licenses/odbl/1-0/','copyright_url':'https://www.openstreetmap.org/copyright'}}, buildings=[dict(p=[[x,-z] for x,z in r['ring']],h=r['height'],s='plateau',k='commercial') for r in buildings['buildings']],rails=[[[x,-z] for x,z in r['points']] for r in osm['railways'] if float(r['tags'].get('layer',0))>=0])
    terrain = dict(origin=CENTER,size=2,x0=-500,y0=-500,step=1000,grid=[[0,0],[0,0]],base_m=0,source='flat local ground; no GSI terrain used in Shibuya')
    town = PromoTown()
    engine = dict(area='shibuya',site=latlon(*STORE),center=CENTER,pois=town.pois,roads=[dict(kind=r['kind'],points=r['points']) for r in osm['roads'] if float(r['tags'].get('layer',0))>=0 and r['tags'].get('indoor')!='yes' and r['tags'].get('tunnel')!='yes'],scenarios={'map':{'heat':[[*town.coord[a],*town.coord[b],1] for a in town.adj for b in town.adj[a] if a < b]}})
    for name,data in (('buildings_shibuya.json',b),('terrain_shibuya.json',terrain),('engine_shibuya_promo.json',engine)):
        (directory/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')


def write_site(directory, data=None):
    import shutil
    from .publication import write_notices
    from . import promo
    directory = Path(directory)
    directory.mkdir(parents=True,exist_ok=True)
    source = resources.files('asagaya_town_sim').joinpath('web3d')
    with resources.as_file(source) as p:
        shutil.copytree(p,directory/'web3d',dirs_exist_ok=True)
    data = data or config()
    dest = directory/'web3d/data'
    if not (dest/'engine.json').exists():
        from . import cli
        import argparse
        args=argparse.Namespace(area='asagaya',no_llm=True,seeds=3,residents=400,visitors=350,commuters=150,record=250)
        _,_,legacy,_,_,_=cli.build(args)
        (dest/'engine.json').write_text(json.dumps(legacy,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        (directory/'2d.html').write_text(cli.render_html(legacy),encoding='utf-8')
    (dest/'shibuya_config.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    promo_assets(dest)
    promo_blob=json.dumps(promo.simulate(promo.load_config(area='shibuya')),ensure_ascii=False,separators=(',',':'))
    (dest/'promo_shibuya.json').write_text(promo_blob,encoding='utf-8')
    # The promo viewer reads its default dataset before choosing a map. A fresh
    # installed export needs it too; Pages may already supply the legacy dataset.
    if not (dest/'promo.json').exists():
        (dest/'promo.json').write_text(promo_blob,encoding='utf-8')
    write_notices(directory,dest)
    (directory/'index.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=web3d/shibuya/"><a href="web3d/shibuya/">Shibuya scramble</a>',encoding='utf-8')
    return directory
