"""Socket-free capture of the actual three.js scene, using an authored CPU renderer.

Used when OS sandbox rules prevent Chromium or local HTTP sockets. Geometry,
transforms, textures and model states are exported by the same scene module.
"""
from __future__ import annotations
import argparse
import ctypes as C
import hashlib
import json
import math
import multiprocessing as MP
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import shutil
import subprocess
import time
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from record_shibuya_halloween import CREDIT, STILLS, FPS, DURATION, probe_video

ROOT=Path(__file__).resolve().parents[1]
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
BOLD='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
BG='#101326'; WHITE='#f9f0df'; MUTED='#c0b2ca'; PURPLE='#d5baff'; AMBER='#efc48c'; RED='#ffabb9'; MINT='#abf2d0'

def rgba(color):
    if color=='transparent': return (0,0,0,0)
    if color.startswith('rgba('):
        a=color[5:-1].split(',');return tuple([int(float(x)) for x in a[:3]]+[int(float(a[3])*255)])
    from PIL.ImageColor import getrgb
    return (*getrgb(color),255)

def canvas_texture(canvas):
    w,h=canvas['width'],canvas['height']; im=Image.new('RGBA',(w,h));draw=ImageDraw.Draw(im)
    for op in canvas['ops']:
        style=op['style'];args=op['args']
        if isinstance(style,str):
            if op['kind']=='text':
                size=int(op.get('font','20px').split('px')[0].split()[-1]);f=ImageFont.truetype(BOLD if 'bold' in op.get('font','') else FONT,size,index=0);draw.text((args[0],args[1]-size),op['text'],font=f,fill=rgba(style))
            elif op['kind']=='rect':
                x,y,r,s=args;draw.rectangle((x,y,x+r-1,y+s-1),fill=rgba(style))
            else:
                x,y,r,*_=args;draw.ellipse((x-r,y-r,x+r,y+r),fill=rgba(style))
        else:
            yy,xx=np.mgrid[0:h,0:w];a=style['args']
            if style['kind']=='radial': t=np.sqrt((xx-a[3])**2+(yy-a[4])**2)/a[5]
            else:t=(yy-a[1])/max(1,a[3]-a[1])
            stops=style['stops'];v=np.array([rgba(c) for _,c in stops]);ts=[s for s,_ in stops]
            pixels=np.stack([np.interp(t,ts,v[:,i]) for i in range(4)],axis=-1).astype('uint8')
            layer=Image.fromarray(pixels);im=Image.alpha_composite(im,layer);draw=ImageDraw.Draw(im)
    return np.array(im,dtype=np.uint8)

class SoftwareScene:
    def __init__(self,directory):
        self.directory=directory;self.info=json.loads((directory/'scene.json').read_text());self.data=np.fromfile(directory/'geometry.bin',dtype=np.float32)
        self.geometries=[]
        for g in self.info['geometries']:
            attrs={k:self.data[v['offset']//4:v['offset']//4+v['count']].reshape(-1,2 if k=='uv' else 3) for k,v in g['attrs'].items()};self.geometries.append(attrs)
        self.textures=[canvas_texture(c) for c in self.info['textures']];self.width=1080;self.height=1920
        source=ROOT/'tools/halloween_raster.c';lib=directory/'raster.so'
        subprocess.run(['cc','-O3','-ffast-math','-shared','-fPIC',str(source),'-lm','-o',str(lib)],check=True)
        self.lib=C.CDLL(str(lib));P=C.c_void_p;I=C.c_int;F=C.c_float
        self.lib.triangles.argtypes=[P,P,I,I,P,P,I,P,I,I,I,F,F,F,F,I]
        self.lib.points.argtypes=[P,P,I,I,P,P,I,F,P,I,I,F]
        self.lib.lines.argtypes=[P,P,I,I,P,I,F,F,F]
    def project(self,positions,matrix,view,projection):
        world=positions@matrix[:3,:3].T+matrix[:3,3];eye=world@view[:3,:3].T+view[:3,3];clip=eye@projection[:3,:3].T+projection[:3,3]
        z=-eye[:,2];safe=np.maximum(z,.001);screen=np.column_stack(((clip[:,0]/safe+1)*self.width/2,(1-clip[:,1]/safe)*self.height/2,np.where(z>1,1/safe,-1))).astype(np.float32)
        return screen,z
    def heat_texture(self,positions):
        heat=Image.new('RGBA',(128,128));a=np.zeros((16,16),dtype=np.float32)
        for x,_,z in positions:
            ix=int((x+45)/90*16);iz=int((z+45)/90*16)
            if 0<=ix<16 and 0<=iz<16:a[iz,ix]+=1
        yy,xx=np.mgrid[:128,:128]
        for iz,ix in np.argwhere(a>0):
            n=a[iz,ix];rgb=(255,35,88) if n>5 else (255,95,126) if n>2 else (55,208,255)
            alpha=np.maximum(0,1-np.sqrt((xx-(ix*8+4))**2+(yy-(iz*8+4))**2)/13)*min(.98,.22+n*.09)*255
            arr=np.empty((128,128,4),dtype=np.uint8);arr[:,:,:3]=rgb;arr[:,:,3]=alpha;heat=Image.alpha_composite(heat,Image.fromarray(arr))
        return np.array(heat)
    def render(self,path):
        values=np.fromfile(path,dtype=np.float32);projection=values[:16].reshape(4,4).T;view=values[16:32].reshape(4,4).T;offset=32;transforms=[]
        for _ in self.info['objects']:
            transforms.append((values[offset:offset+16].reshape(4,4).T,values[offset+16]>0,int(values[offset+17])));offset+=18
        dynamic={}
        for spec in self.info['dynamic']:
            if 'instance_count' in spec:
                n=spec['instance_count'];dynamic[spec['object']]=values[offset:offset+n].reshape(-1,4,4).transpose(0,2,1);offset+=n;continue
            n=spec['position_count'];pos=values[offset:offset+n].reshape(-1,3);offset+=n;m=spec['color_count'];col=values[offset:offset+m].reshape(-1,3) if m else None;offset+=m;dynamic[spec['object']]=(pos,col)
        canvas=np.zeros((self.height,self.width,3),dtype=np.uint8);top=np.array([8,13,38]);bottom=np.array([101,66,99]);t=np.linspace(0,1,self.height)[:,None,None];canvas[:]=(top[None,None,:]*(1-t)+bottom[None,None,:]*t).astype('uint8')
        depth=np.full((self.height,self.width),np.inf,dtype=np.float32);textures=list(self.textures)
        state_path=path.with_name(path.name.replace('frame-','state-').replace('.bin','.json'))
        if state_path.exists():
            state=json.loads(state_path.read_text());textures[self.info['heat_texture']]=self.heat_texture(state['heat_people'])
        order=sorted(range(len(self.info['objects'])),key=lambda i:self.info['objects'][i]['material']['transparent'])
        for i in order:
            obj=self.info['objects'][i];matrix,visible,count=transforms[i]
            if not visible:continue
            attrs=self.geometries[obj['geometry']];mat=obj['material'];pos=attrs['position'];col=attrs.get('color')
            if i in dynamic and obj['kind']!='instances':pos,col=dynamic[i]
            normal_attr=attrs.get('normal')
            if obj['kind']=='instances':
                if not count:continue
                transforms_i=dynamic[i][:count];rot=transforms_i[:,:3,:3];origin=transforms_i[:,:3,3]
                pos=(np.einsum('nj,ikj->ink',pos,rot)+origin[:,None,:]).reshape(-1,3)
                normal_attr=np.einsum('nj,ikj->ink',attrs['normal'],rot).reshape(-1,3)
                col=np.tile(attrs['color'],(count,1))

            if obj['kind']=='segments':continue
            # The huge authored base slab is filled as the ground plane below.
            if len(pos)==36 and np.max(np.abs(matrix[:3,:3]))>500:continue
            screen,distance=self.project(pos,matrix,view,projection)
            if obj['kind']=='line':
                self.lib.lines(canvas.ctypes.data,depth.ctypes.data,self.width,self.height,screen.ctypes.data,len(pos),*mat['color']);continue
            if obj['kind']=='points':
                rgb=np.ascontiguousarray(col if mat['vertexColors'] and col is not None else np.tile(mat['color'],(len(pos),1)),dtype=np.float32);texture=textures[mat['map']] if mat['map']>=0 else None
                self.lib.points(canvas.ctypes.data,depth.ctypes.data,self.width,self.height,screen.ctypes.data,rgb.ctypes.data,count,mat['size']*self.height/(2*math.tan(math.radians(43/2))),texture.ctypes.data if texture is not None else None,texture.shape[1] if texture is not None else 0,texture.shape[0] if texture is not None else 0,mat['opacity']);continue
            base=np.tile(np.array(mat['color'],dtype=np.float32),(len(pos),1))
            if mat['vertexColors'] and col is not None:base*=col
            if not mat['basic'] and 'normal' in attrs:
                normal=normal_attr@np.linalg.inv(matrix[:3,:3]);normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),.0001)
                sun=np.array([-.46,.86,-.24]);fill=np.array([.15,.4,.9]);light=.45+np.maximum(0,normal@sun)*.72+np.maximum(0,normal@fill)*.28+np.maximum(0,normal[:,1])*.22
                base*=light[:,None]
            uv=attrs.get('uv',np.zeros((len(pos),2),dtype=np.float32));attribute=np.ascontiguousarray(np.column_stack((base,uv,distance)),dtype=np.float32)
            tid=mat['map'] if mat['map']>=0 else mat['emissiveMap'];kind=1 if mat['map']>=0 else 2 if mat['emissiveMap']>=0 else 0;texture=textures[tid] if tid>=0 else None;emission=np.array(mat['emissive'])*mat['emissiveIntensity']
            self.lib.triangles(canvas.ctypes.data,depth.ctypes.data,self.width,self.height,screen.ctypes.data,attribute.ctypes.data,len(pos),texture.ctypes.data if texture is not None else None,texture.shape[1] if texture is not None else 0,texture.shape[0] if texture is not None else 0,kind,*emission,mat['opacity'],int(mat['depthWrite']))
        im=Image.fromarray(canvas).resize((1080,1920),Image.Resampling.LANCZOS)
        # Local emissive bloom, authored from the rendered pixels; no image assets.
        bright=np.array(im);mask=np.maximum(bright.max(axis=2).astype(float)-185,0)/70
        glow=Image.fromarray((bright*mask[:,:,None]*.35).clip(0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(8))
        from PIL import ImageChops
        return ImageChops.add(im,glow)

class Film:
    def __init__(self,scene,metrics):
        self.scene=scene;self.metrics=metrics;self.fonts={};self.comparison=None;self.credits=None
    def font(self,size,bold=False):
        key=(size,bold)
        if key not in self.fonts:self.fonts[key]=ImageFont.truetype(BOLD if bold else FONT,size,index=0)
        return self.fonts[key]
    def sparkle(self,draw,x,y,r):
        draw.polygon([(x,y-r),(x+r*.18,y-r*.18),(x+r,y),(x+r*.18,y+r*.18),(x,y+r),(x-r*.18,y+r*.18),(x-r,y),(x-r*.18,y-r*.18)],fill=AMBER)
    def text(self,draw,xy,text,size=24,fill=WHITE,bold=False):
        draw.text(xy,text,font=self.font(size,bold),fill=fill,spacing=int(size*.32))
    def shade(self,im):
        p=np.zeros((1920,1,4),dtype=np.uint8);p[:,:,:3]=(10,12,30)
        for y in range(1920):
            p[y,:,3]=int(max(max(0,1-y/590)*235,max(0,(y-1430)/490)*250))
        return Image.alpha_composite(im.convert('RGBA'),Image.fromarray(p).resize(im.size)).convert('RGB')
    def footer(self,d):
        self.text(d,(64,1734),'*Toy-model simulation / トイモデル・予測ではない',24,AMBER)
        self.text(d,(64,1780),'PLATEAU 渋谷2023 加工 · CC BY 4.0 | © OSM contributors · ODbL',16,MUTED)
        self.text(d,(64,1810),'HAGINO 2026 · Original procedural art · Full credits in NOTICE / ASSETS',16,MUTED)
    def card(self,im,box,fill='#151c35e6',outline=None):
        layer=Image.new('RGBA',im.size);d=ImageDraw.Draw(layer);d.rounded_rectangle(box,radius=24,fill=fill,outline=outline,width=2);im.paste(layer,(0,0),layer)
    def frame(self,state,scene_image):
        im=self.shade(scene_image);d=ImageDraw.Draw(im);t=state['seconds']
        self.text(d,(60,75),'SHIBUYA / HALLOWEEN',24,AMBER,True);self.sparkle(d,987,101,14)
        ja=state['captions'][0];size=68 if state['hook'] else 66
        self.text(d,(56,142),ja,size,WHITE,True)
        ey=340 if state['hook'] else 252
        self.text(d,(60,ey),state['captions'][1],40,PURPLE,True)
        if state['regional']:
            # One compact label per fictional destination; measured OFF→ON arrivals.
            positions=[(60,1110),(600,650),(82,485),(595,1010),(600,1360)]
            for i,(hub,(x,y)) in enumerate(zip(state['hubs'],positions)):
                if state['activation']<=i*.16:continue
                hx,hy,hz=hub['screen'];accent='#%06x'%hub['color']
                d.line((x+190,y+88,max(30,min(1050,hx)),max(420,min(1550,hy))),fill=accent,width=2)
                self.card(im,(x,y,x+420,y+148),outline=accent);d=ImageDraw.Draw(im)
                self.text(d,(x+18,y+6),hub['name']+' / '+hub['en'],30,WHITE,True)
                self.text(d,(x+18,y+52),['架空の仮装コンテスト','架空の星くずパレード','架空のランタン庭園','架空の光さんぽ','架空のかぼちゃ屋台村'][i],21,accent)
                a=self.metrics['no_events']['district_people'][i];b=self.metrics['events_on']['district_people'][i]
                self.text(d,(x+18,y+89),f'{a} → {b} 人 / people',30,accent,True)
            self.text(d,(60,1560),'徒歩 + 山手線 + 井の頭線',32,MINT,True)
            self.text(d,(60,1610),'Walking + Yamanote + Inokashira',28,PURPLE)
            self.text(d,(60,1660),'人数：同じ30分の到着数 / OFF → ON · arrivals in 30 min',21,MUTED)
        elif state['comparison']:
            self.card(im,(48,1190,1032,1678));d=ImageDraw.Draw(im)
            a=self.metrics['no_events'];b=self.metrics['events_on']
            self.text(d,(78,1212),'交差点ピーク密度 / Crossing peak · people/m²',28,MUTED)
            self.text(d,(78,1263),f"{a['peak_density_per_m2']:.2f} → {b['peak_density_per_m2']:.2f}",86,MINT,True)
            self.text(d,(78,1390),'イベントなし → あり / No events → Events',29,PURPLE,True)
            self.text(d,(78,1457),f"街への到着 {a['visits']} → {b['visits']} / district arrivals",33,WHITE,True)
            self.text(d,(78,1520),f"最多：代々木 {self.metrics['best_event']['people']}人 / Best: Yoyogi",33,AMBER,True)
            self.text(d,(78,1600),'同じ960人・30分 / Same 960 people · 30 min · seed 1031',22,MUTED)
        elif state['green']:
            self.card(im,(60,1510,1020,1640));d=ImageDraw.Draw(im)
            self.text(d,(90,1532),'● GREEN / みんなで、渡ろう。',43,MINT,True)
        elif t>=11 and not state['loop']:
            self.text(d,(60,1540),'灯りは、交差点の外にも。',39,MINT,True)
            self.text(d,(60,1605),'The side quest is the destination.',31,PURPLE)
        elif state['hook']:
            self.text(d,(60,1565),'行き先を増やす。さて、分散する？',35,WHITE,True)
            self.text(d,(60,1625),'More destinations. Less packed?',32,PURPLE)
        self.footer(d)
        return im
    def compare(self):
        raise RuntimeError('Comparison is integrated into the live city view')
    def credit(self,scene_image):
        # Short credit card remains on the live city, preserving the loop camera.
        im=self.shade(scene_image);self.card(im,(48,1250,1032,1700));d=ImageDraw.Draw(im)
        self.text(d,(78,1290),'HAGINO 2026 · Original art + code · MIT',36,WHITE,True)
        self.text(d,(78,1370),'PLATEAU 渋谷2023 加工 · CC BY 4.0',31,PURPLE)
        self.text(d,(78,1430),'© OSM contributors · ODbL',31,PURPLE)
        self.text(d,(78,1510),'three.js · MIT | Noto Sans CJK JP · OFL 1.1',25,MUTED)
        self.text(d,(78,1580),'Full credits: NOTICE + ASSETS.md',27,MUTED)
        self.footer(d);return im

def render_capture_frame(frame):
    scene,film,directory,stills,frames,preview=_CAPTURE
    path=frames/f'frame-{frame:05d}.jpg'
    if not preview and path.exists() and frame not in STILLS:return frame
    state=json.loads((directory/f'state-{frame:05d}.json').read_text())
    raw=scene.render(directory/f'frame-{frame:05d}.bin')
    im=film.credit(raw) if state['credits'] else film.frame(state,raw)
    if frame in STILLS:im.save(stills/STILLS[frame])
    if not preview:
        temporary=path.with_suffix('.tmp');im.save(temporary,format='JPEG',quality=96,subsampling=0);temporary.replace(path)
    return frame

def record(output,stills,metrics_path,preview=False):
    start=time.monotonic();output.parent.mkdir(parents=True,exist_ok=True);stills.mkdir(parents=True,exist_ok=True);frames=stills/'.software-frames';frames.mkdir(exist_ok=True);directory=stills/'.scene-cache';directory.mkdir(exist_ok=True)
    sources=[*sorted((ROOT/'web3d/shibuya').glob('halloween*')),ROOT/'tools/export_shibuya_halloween_scene.mjs',ROOT/'tools/record_shibuya_halloween_software.py',ROOT/'tools/halloween_raster.c',ROOT/'tools/record_shibuya_halloween.py',ROOT/'web3d/data/shibuya_plateau.json',ROOT/'web3d/data/shibuya_osm.json',ROOT/'web3d/data/shibuya_halloween_region.json']
    signature=hashlib.sha256(b''.join(p.read_bytes() for p in sources)).hexdigest();manifest=frames/'source.sha256'
    if manifest.exists() and manifest.read_text()!=signature:
        for p in frames.glob('frame-*.jpg'):p.unlink()
    manifest.write_text(signature)
    cmd=['node',str(ROOT/'tools/export_shibuya_halloween_scene.mjs'),str(directory)]+(['--preview'] if preview else []);subprocess.run(cmd,check=True)
    metrics=json.loads((directory/'metrics.json').read_text())
    if metrics_path.exists():assert json.loads(metrics_path.read_text())==metrics
    metrics_path.parent.mkdir(parents=True,exist_ok=True);metrics_path.write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n');shutil.copyfile(metrics_path,stills/'metrics.json')
    for source,target in [(ROOT/'NOTICE','NOTICE'),(ROOT/'LICENSE','LICENSE'),(ROOT/'docs/HALLOWEEN_ASSETS.md','ASSETS.md')]:shutil.copyfile(source,stills/target)
    scene=SoftwareScene(directory);film=Film(scene,metrics);snapshots=[]
    selected=list(STILLS) if preview else range(FPS*DURATION)
    global _CAPTURE
    _CAPTURE=(scene,film,directory,stills,frames,preview)
    with ProcessPoolExecutor(max_workers=4,mp_context=MP.get_context('fork')) as pool:
        for frame in pool.map(render_capture_frame,selected,chunksize=1):
            if frame in STILLS:snapshots.append({'frame':frame,'video_seconds':frame/FPS})
            if frame%24==0 or preview:print(f'{frame/FPS:.2f}/{DURATION}s · CPU rendering actual three.js geometry',flush=True)
    probe=None
    if not preview:
        partial=output.with_name(output.stem+'.partial.mp4');subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(FPS),'-i',str(frames/'frame-%05d.jpg'),'-frames:v',str(FPS*DURATION),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={CREDIT}','-metadata','comment=Toy-model values; same procedural three.js geometry, local CPU raster capture; fictional neighborhood events, matched arrivals and rail journeys; 18s loop.',str(partial)],check=True);probe=probe_video(partial);partial.replace(output)
    result={'video':str(output),'renderer':'authored CPU rasterizer of actual three.js scene','source_sha256':signature,'preview':preview,'width':1080,'height':1920,'fps':24,'duration_s':DURATION,'wall_seconds':round(time.monotonic()-start,2),'screenshots':[str(stills/p) for p in STILLS.values()],'snapshots':snapshots,'probe':probe,'errors':[]}
    (stills/('preview.json' if preview else 'recording.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,default=Path('/workspace/demos/shibuya-halloween.mp4'));ap.add_argument('--stills',type=Path,default=Path('/workspace/demos/shibuya-halloween'));ap.add_argument('--metrics',type=Path,default=ROOT/'out/media/shibuya-halloween-metrics.json');ap.add_argument('--preview',action='store_true');args=ap.parse_args();record(args.output,args.stills,args.metrics,args.preview)
