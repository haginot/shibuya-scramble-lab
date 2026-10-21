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
            if op['kind']=='rect':
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
        self.textures=[canvas_texture(c) for c in self.info['textures']];self.width=900;self.height=1092
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
            n=a[iz,ix];rgb=(255,70,93) if n>8 else (255,165,75) if n>3 else (98,239,200)
            alpha=np.maximum(0,1-np.sqrt((xx-(ix*8+4))**2+(yy-(iz*8+4))**2)/13)*min(.85,.13+n*.065)*255
            arr=np.empty((128,128,4),dtype=np.uint8);arr[:,:,:3]=rgb;arr[:,:,3]=alpha;heat=Image.alpha_composite(heat,Image.fromarray(arr))
        return np.array(heat)
    def render(self,path):
        values=np.fromfile(path,dtype=np.float32);projection=values[:16].reshape(4,4).T;view=values[16:32].reshape(4,4).T;offset=32;transforms=[]
        for _ in self.info['objects']:
            transforms.append((values[offset:offset+16].reshape(4,4).T,values[offset+16]>0,int(values[offset+17])));offset+=18
        dynamic={}
        for spec in self.info['dynamic']:
            n=spec['position_count'];pos=values[offset:offset+n].reshape(-1,3);offset+=n;m=spec['color_count'];col=values[offset:offset+m].reshape(-1,3) if m else None;offset+=m;dynamic[spec['object']]=(pos,col)
        canvas=np.zeros((self.height,self.width,3),dtype=np.uint8);top=np.array([8,13,38]);bottom=np.array([101,66,99]);t=np.linspace(0,1,self.height)[:,None,None];canvas[:]=(top[None,None,:]*(1-t)+bottom[None,None,:]*t).astype('uint8')
        depth=np.full((self.height,self.width),np.inf,dtype=np.float32);textures=list(self.textures)
        crowd_index=self.info['dynamic'][1]['object'] if len(self.info['dynamic'])>1 else self.info['dynamic'][0]['object']
        # The scene's first point mesh is sparkles; the second is the crowd.
        count=transforms[crowd_index][2];textures[-1]=self.heat_texture(dynamic[crowd_index][0][:count])
        order=sorted(range(len(self.info['objects'])),key=lambda i:self.info['objects'][i]['material']['transparent'])
        for i in order:
            obj=self.info['objects'][i];matrix,visible,count=transforms[i]
            if not visible:continue
            attrs=self.geometries[obj['geometry']];mat=obj['material'];pos=attrs['position'];col=attrs.get('color')
            if i in dynamic:pos,col=dynamic[i]
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
                normal=attrs['normal']@np.linalg.inv(matrix[:3,:3]);normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),.0001)
                sun=np.array([-.46,.86,-.24]);fill=np.array([.15,.4,.9]);light=.45+np.maximum(0,normal@sun)*.72+np.maximum(0,normal@fill)*.28+np.maximum(0,normal[:,1])*.22
                base*=light[:,None]
            uv=attrs.get('uv',np.zeros((len(pos),2),dtype=np.float32));attribute=np.ascontiguousarray(np.column_stack((base,uv,distance)),dtype=np.float32)
            tid=mat['map'] if mat['map']>=0 else mat['emissiveMap'];kind=1 if mat['map']>=0 else 2 if mat['emissiveMap']>=0 else 0;texture=textures[tid] if tid>=0 else None;emission=np.array(mat['emissive'])*mat['emissiveIntensity']
            self.lib.triangles(canvas.ctypes.data,depth.ctypes.data,self.width,self.height,screen.ctypes.data,attribute.ctypes.data,len(pos),texture.ctypes.data if texture is not None else None,texture.shape[1] if texture is not None else 0,texture.shape[0] if texture is not None else 0,kind,*emission,mat['opacity'],int(mat['depthWrite']))
        return Image.fromarray(canvas).resize((1080,1310),Image.Resampling.LANCZOS)

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
    def frame(self,state,scene_image):
        im=Image.new('RGB',(1080,1920),BG);im.paste(scene_image,(0,280));d=ImageDraw.Draw(im)
        # Gentle authored fades separate typography from the 3D stage.
        overlay=Image.new('RGBA',im.size);p=np.zeros((1920,1080,4),dtype=np.uint8);p[:,:,:3]=(16,19,38)
        for y in range(280,650):p[y,:,3]=int(max(0,1-(y-280)/370)*245)
        for y in range(1200,1590):p[y,:,3]=int(min(1,(y-1200)/390)*245)
        im=Image.alpha_composite(im.convert('RGBA'),Image.fromarray(p)).convert('RGB');d=ImageDraw.Draw(im)
        d.ellipse((55,55,64,64),fill=AMBER);self.text(d,(80,43),'SHIBUYA SCRAMBLE LAB',19,AMBER,True);self.text(d,(720,46),'HALLOWEEN STUDY / 01',16,AMBER)
        self.text(d,(51,80),'SHIBUYA',98,WHITE,True);self.text(d,(51,185),'AFTER DARK',84,PURPLE,True);self.sparkle(d,709,245,27)
        self.text(d,(55,306),'毎年荒れる渋谷ハロウィンを、\nお店のプロモーションで分散できるか？',28)
        d.line((55,407,1025,407),fill='#65516d',width=1);n,ja,en=state['chapter'];self.text(d,(55,426),n,45,PURPLE);self.text(d,(135,430),ja,30,WHITE,True);self.text(d,(136,477),en,15,MUTED)
        promo=state['promoted'];accent=MINT if promo else RED
        d.rounded_rectangle((830,436,1025,483),radius=24,fill='#2a2032',outline=accent);self.text(d,(855,445),'PROMO ON' if promo else 'NO PROMO',19,accent)
        self.text(d,(55,535),'PLATEAU 1,050棟 · 建物形状はそのまま\nOriginal footprints & heights · procedural night materials',17,'#dbd3e1')
        s=state['state'];clock=state['simTime'];self.text(d,(55,1230),f'SIM {clock//60:02d}:{clock%60:02d}',18);self.text(d,(285,1232),'SEED 1031 · 960 AGENTS',16,MUTED);self.text(d,(650,1230),'同じ到着条件で再試行 / Paired replay' if promo else '販促なし / No promotion',16,accent)
        d.rounded_rectangle((44,1290,1036,1622),radius=22,fill='#171829',outline='#6c536e',width=1)
        self.text(d,(74,1310),'JUNCTION OBSERVATION / 交差点の様子',15,MUTED);self.text(d,(775,1310),'● LOW → HIGH ●',13,AMBER)
        self.text(d,(74,1351),'中心部の密度 / Central density',20,MUTED);self.text(d,(620,1351),'店舗への来訪 / Shop visits',20,MUTED)
        self.text(d,(72,1371),f"{s['density']:.3f}",77,accent,True);self.text(d,(618,1371),str(s['visits']),77,accent,True);d.line((580,1356,580,1500),fill='#493b52')
        self.text(d,(75,1479),'人/m² · people/m²',16,MUTED);self.text(d,(620,1479),'到着を計数 / completed arrivals',16,MUTED)
        d.line((74,1526,1006,1526),fill='#493b52');self.text(d,(74,1535),state['offer'][0],22,AMBER);self.text(d,(74,1574),state['offer'][1],16,MUTED)
        self.text(d,(55,1640),state['captions'][0],33,WHITE,True);self.text(d,(55,1701),state['captions'][1],22,PURPLE)
        self.footer(d)
        d.rectangle((0,1915,int(state['seconds']/28*1080),1919),fill=AMBER)
        return im
    def footer(self,d):
        self.text(d,(55,1772),'トイモデル・予測ではない / Toy model — not a prediction',20,AMBER)
        self.text(d,(55,1810),'横断量・行動・販促効果は未較正 / Uncalibrated movement & promotion effects',15,MUTED)
        self.text(d,(55,1850),'国土交通省 Project PLATEAU・渋谷区 2023 加工 · CC BY 4.0\n© OpenStreetMap contributors · ODbL 1.0 · three.js MIT · HAGINO 2026',14,'#a9a0b8')
    def compare(self):
        if self.comparison:return self.comparison.copy()
        im=Image.new('RGB',(1080,1920),BG);d=ImageDraw.Draw(im)
        self.text(d,(55,55),'03 / SAME ARRIVALS. DIFFERENT DESTINATIONS.',19,AMBER,True)
        self.text(d,(55,114),'集合場所を、',70,WHITE,True);self.text(d,(55,215),'ひとつ減らそう。',70,PURPLE,True)
        self.text(d,(55,337),'同じ960人・seed 1031・900秒の比較\nSame 960 agents · matched seed · 900 simulated seconds',23,MUTED)
        for x,prefix,title,subtitle,accent in [(55,'no','販促なし','NO PROMO',RED),(550,'promo','販促あり','PROMO',MINT)]:
            result=self.metrics['no_promo' if prefix=='no' else 'promo'];d.rounded_rectangle((x,454,x+475,1350),radius=20,fill='#201d2d',outline='#66506e')
            self.text(d,(x+24,471),title,30,accent,True);self.text(d,(x+24,523),subtitle,15,accent)
            view=self.scene.render(self.scene.directory/f'compare-{prefix}.bin');view=view.resize((475,576),Image.Resampling.LANCZOS);im.paste(view.crop((0,50,475,500)),(x,568));d=ImageDraw.Draw(im)
            self.text(d,(x+25,1036),'ピーク密度 / Peak density',20,MUTED);self.text(d,(x+24,1062),f"{result['peak_density_per_m2']:.4f}",67,accent,True);self.text(d,(x+25,1154),'人/m² · people/m²',18,MUTED)
            self.text(d,(x+25,1204),'店舗来訪 / Shop visits',20,MUTED);self.text(d,(x+25,1235),str(result['visits']),64,WHITE,True)
        self.text(d,(245,1384),'トイモデルの値 / toy-model values',28,AMBER)
        d.rounded_rectangle((55,1450,1025,1650),radius=15,outline='#55435e');d.line((80,1603,1000,1603),fill='#484254');d.line((80,1530,1000,1530),fill='#484254')
        for key,accent in [('no_promo',RED),('promo',MINT)]:
            points=[(80,1603)]+[(80+s['time_s']/900*920,1603-s['central_count']/800*130) for s in self.metrics[key]['history']];d.line(points,fill=accent,width=5)
        self.text(d,(80,1613),'0 s',15,MUTED);self.text(d,(290,1613),'中心部の人数 / Central occupancy',15,MUTED);self.text(d,(945,1613),'900 s',15,MUTED)
        self.text(d,(55,1680),'密度：交差点中心の半径24m内の人数 ÷ 面積。ピークは全900秒。\n来訪：架空店に到着した人数。受諾率82%などを仮定。\nDensity: centres in a 24m disk / area. Peak over 900s.\nVisits count arrivals at fictional shops. Assumed acceptance: 82%.\n静止画は両条件とも900秒時点 / Both images at sim 900s.',18,MUTED)
        self.comparison=im;return im.copy()
    def credit(self):
        if self.credits:return self.credits.copy()
        im=Image.new('RGB',(1080,1920),BG);d=ImageDraw.Draw(im);self.text(d,(55,55),'04 / CREDITS & SOURCES',19,AMBER,True)
        self.text(d,(55,115),'街の夜に、',76,WHITE,True);self.text(d,(55,225),'余白を。',76,PURPLE,True)
        self.text(d,(55,367),'荒れる渋谷、施策で散らせるか？\nCan promos tame the Shibuya crush?',26,PURPLE)
        blocks=[(505,'地理データ / GEOGRAPHY','国土交通省 Project PLATEAU・渋谷区 2023\n足元形状＋高さに加工 / Modified footprints & heights\nCC BY 4.0 · geometry unchanged for this night mode', 'geospatial.jp/ckan/dataset/plateau-13113-shibuya-ku-2023\ncreativecommons.org/licenses/by/4.0/'),(805,'','© OpenStreetMap contributors · ODbL 1.0\n道路・鉄道 / Roads & rails','openstreetmap.org/copyright\nopendatacommons.org/licenses/odbl/1-0/'),(1030,'制作・素材 / MADE FOR THIS FILM','HAGINO · 2026 · MIT code & original procedural art\nthree.js r160 · MIT · three.js authors\n木・かぼちゃ・おばけ・魔女・窓・粒子：自作\nTrees, pumpkins, ghosts, witch, windows, particles: authored geometry','書体 / Font: Noto Sans CJK JP · SIL OFL 1.1\n音声なし / Silent film · No external decorative assets'),(1405,'トイモデル / TOY EXPERIMENT','seed 1031 · 960 agents · 900s · paired arrivals\n架空店舗・販促・経路・時間は仮定。予測ではありません。\nUncalibrated routes, behaviour and offers. Not a prediction.\n車両なしの歩行者経路実験 / Pedestrian-only routing experiment','Existing vehicle data: Eclipse SUMO 1.28.0 / OSM; unused here.\nStatistical/train source notes retained in local web3d/data/NOTICE.\nMetrics: out/media/shibuya-halloween-metrics.json')]
        for y,title,body,small in blocks:
            if title:d.line((55,y-15,1025,y-15),fill='#55415e');self.text(d,(55,y),title,19,AMBER,True)
            start=y+42 if title else y
            self.text(d,(55,start),body,22);lines=body.count('\n')+1;self.text(d,(55,start+lines*30+18),small,17,MUTED)
        self.text(d,(55,1844),'SHIBUYA  /  AFTER DARK',25,PURPLE,True);self.sparkle(d,998,1861,23)
        self.credits=im;return im.copy()

def record(output,stills,metrics_path,preview=False):
    start=time.monotonic();stills.mkdir(parents=True,exist_ok=True);frames=stills/'.software-frames';frames.mkdir(exist_ok=True);directory=stills/'.scene-cache';directory.mkdir(exist_ok=True)
    sources=[*sorted((ROOT/'web3d/shibuya').glob('halloween*')),ROOT/'tools/export_shibuya_halloween_scene.mjs',ROOT/'tools/record_shibuya_halloween_software.py',ROOT/'tools/halloween_raster.c',ROOT/'web3d/data/shibuya_plateau.json',ROOT/'web3d/data/shibuya_osm.json']
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
    for frame in selected:
        path=frames/f'frame-{frame:05d}.jpg'
        if not preview and path.exists() and frame not in STILLS:continue
        if frame>=576:im=film.credit()
        elif frame>=480:im=film.compare()
        else:
            state=json.loads((directory/f'state-{frame:05d}.json').read_text());im=film.frame(state,scene.render(directory/f'frame-{frame:05d}.bin'))
        if frame in STILLS:im.save(stills/STILLS[frame]);snapshots.append({'frame':frame,'video_seconds':frame/FPS})
        if not preview:im.save(path,quality=96,subsampling=0)
        if frame%24==0 or preview:print(f'{frame/FPS:.2f}/{DURATION}s · CPU rendering actual three.js geometry',flush=True)
    probe=None
    if not preview:
        partial=output.with_name(output.stem+'.partial.mp4');subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(FPS),'-i',str(frames/'frame-%05d.jpg'),'-frames:v',str(FPS*DURATION),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={CREDIT}','-metadata','comment=Toy-model values; same procedural three.js geometry, local CPU raster capture; paired replay at 12s.',str(partial)],check=True);probe=probe_video(partial);partial.replace(output)
    result={'video':str(output),'renderer':'authored CPU rasterizer of actual three.js scene','source_sha256':signature,'preview':preview,'width':1080,'height':1920,'fps':24,'duration_s':28,'wall_seconds':round(time.monotonic()-start,2),'screenshots':[str(stills/p) for p in STILLS.values()],'snapshots':snapshots,'probe':probe,'errors':[]}
    (stills/('preview.json' if preview else 'recording.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,default=Path('/workspace/demos/shibuya-halloween.mp4'));ap.add_argument('--stills',type=Path,default=Path('/workspace/demos/shibuya-halloween'));ap.add_argument('--metrics',type=Path,default=ROOT/'out/media/shibuya-halloween-metrics.json');ap.add_argument('--preview',action='store_true');args=ap.parse_args();record(args.output,args.stills,args.metrics,args.preview)
