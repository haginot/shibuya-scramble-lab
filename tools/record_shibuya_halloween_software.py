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
        self.textures=[canvas_texture(c) for c in self.info['textures']];self.width=900;self.height=1600
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
            n=a[iz,ix];rgb=(255,35,88) if n>8 else (255,95,126) if n>3 else (55,208,255)
            alpha=np.maximum(0,1-np.sqrt((xx-(ix*8+4))**2+(yy-(iz*8+4))**2)/13)*min(.98,.22+n*.09)*255
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
    def ticket(self,im,x,y,word,u):
        # Self-made coupon pictogram; pop overshoot is tied to film time.
        size=1+.17*math.exp(-u*4)*math.sin(u*12);w,h=int(164*size),int(112*size)
        layer=Image.new('RGBA',(w+48,h+48));d=ImageDraw.Draw(layer)
        d.rounded_rectangle((24,24,w+24,h+24),radius=18,fill='#d9fcff',outline='#6ae3ff',width=4)
        for xx in (24,w+24):d.ellipse((xx-11,24+h/2-11,xx+11,24+h/2+11),fill='#273252')
        for yy in range(38,h+12,13):d.line((w-15,yy,w-15,yy+5),fill='#53899b',width=2)
        self.text(d,(42,38),'COUPON',17,'#3b6477',True);self.text(d,(39,61),word,26,'#292744',True)
        glow=layer.filter(ImageFilter.GaussianBlur(13));im.paste(glow,(int(x-w/2-24),int(y-h/2-24)),glow);im.paste(layer,(int(x-w/2-24),int(y-h/2-24)),layer)
    def frame(self,state,scene_image):
        im=self.shade(scene_image);d=ImageDraw.Draw(im);t=state['seconds']
        self.text(d,(64,80),'SHIBUYA / HALLOWEEN',25,AMBER,True);self.sparkle(d,984,106,15)
        self.text(d,(58,150),state['captions'][0],82,WHITE,True)
        en=state['captions'][1]
        if en=='Free pumpkin latte solves it?':en='Free pumpkin latte\nsolves it?'
        self.text(d,(64,281),en,49,PURPLE,True)
        if state['promoted']:
            for i,shop in enumerate(state['shops']):
                age=t-(6+i*1.5);x,y,z=shop['screen']
                if age>=0 and z<1:
                    px=max(130,min(950,x));py=max(515,min(1400,y-20))
                    d=ImageDraw.Draw(im);d.line((px,py,max(30,min(1050,x)),max(460,min(1470,y))),fill='#6ae3ff',width=2)
                    self.ticket(im,px,py,['LATTE','BOOK','SWEET'][i],age)
            d=ImageDraw.Draw(im)
            self.text(d,(64,1505),state['replay'],23,MINT,True)
            if t<12:
                shop=state['shops'][state['shopIndex']]
                d.rounded_rectangle((64,1563,1016,1696),radius=25,fill='#191a32',outline='#6ae3ff',width=2)
                self.sparkle(d,110,1629,22)
                self.text(d,(155,1573),shop['name']+' · 架空 / FICTIONAL',27,WHITE,True)
                self.text(d,(155,1622),shop['offer'],29,MINT,True)
            else:
                self.text(d,(64,1572),'SIDE QUEST COMPLETE?',38,MINT,True)
                self.text(d,(64,1632),'仮定の販促効果 / Assumed offer response',23,MUTED)
        elif not state['hook']:
            self.text(d,(64,1558),'ONE MEETING POINT. AGAIN.',34,RED,True)
            self.text(d,(64,1624),'同じ交差点に、集合。',34,WHITE,True)
        else:
            self.text(d,(64,1570),'このパズル、解ける？',40,WHITE,True)
            self.text(d,(64,1638),'Can one little deal change the map?',31,PURPLE)
        self.footer(d)
        return im
    def compare(self):
        if self.comparison:return self.comparison.copy()
        im=Image.new('RGB',(1080,1920),BG);d=ImageDraw.Draw(im)
        self.text(d,(64,80),'SAME ARRIVALS / 同じ到着条件',25,AMBER,True)
        self.text(d,(60,157),'赤 vs 青。',90,WHITE,True)
        self.text(d,(64,296),'One tiny toy experiment.',43,PURPLE,True)
        for x,prefix,title,accent in [(36,'no','特典なし / OFF',RED),(558,'promo','特典あり / ON',MINT)]:
            result=self.metrics['no_promo' if prefix=='no' else 'promo']
            view=self.scene.render(self.scene.directory/f'compare-{prefix}.bin')
            # Both sides use the same camera, sim time, crop and scale.
            view=view.crop((160,460,920,1470)).resize((486,646),Image.Resampling.LANCZOS)
            im.paste(view,(x,470));d=ImageDraw.Draw(im)
            self.text(d,(x+12,398),title,34,accent,True)
            d.rectangle((x,1108,x+486,1115),fill=accent)
            self.text(d,(x+10,1160),'ピーク密度 / Peak density',24,MUTED)
            self.text(d,(x+8,1198),f"{result['peak_density_per_m2']:.4f}",77,accent,True)
            self.text(d,(x+12,1310),'人/m² · people/m²',23,MUTED)
            self.text(d,(x+12,1376),'店舗来訪 / Shop visits',25,MUTED)
            self.text(d,(x+10,1418),str(result['visits']),84,WHITE,True)
        self.text(d,(64,1580),'960 agents · seed 1031 · 900 simulated seconds',26,PURPLE)
        self.text(d,(64,1633),'ピークは全900秒。両画像は900秒時点。',24,MUTED)
        self.text(d,(64,1674),'Peak over full run; both views at 900s. Visits count arrivals.',20,MUTED)
        self.footer(d);self.comparison=im;return im.copy()
    def credit(self,scene_image):
        im=self.shade(scene_image);layer=Image.new('RGBA',im.size,(12,14,33,195));im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB');d=ImageDraw.Draw(im)
        self.text(d,(64,470),'MADE AFTER DARK',57,WHITE,True)
        self.text(d,(64,585),'HAGINO · 2026 · Original art + code · MIT',33,PURPLE,True)
        self.sparkle(d,950,508,30)
        self.text(d,(64,800),'PLATEAU 渋谷2023 加工 · CC BY 4.0',32,WHITE,True)
        self.text(d,(64,900),'© OpenStreetMap contributors · ODbL 1.0',30,WHITE,True)
        self.text(d,(64,1000),'three.js · MIT | Noto Sans CJK JP · SIL OFL 1.1',27,MUTED)
        self.text(d,(64,1210),'架空の店舗・特典・行動。実測・予測ではありません。',27,PURPLE)
        self.text(d,(64,1270),'Fictional offers + behaviour. Not a prediction.',27,PURPLE)
        self.text(d,(64,1440),'Full sources / licenses: NOTICE + ASSETS.md',26,MUTED)
        self.footer(d);return im

def record(output,stills,metrics_path,preview=False):
    start=time.monotonic();output.parent.mkdir(parents=True,exist_ok=True);stills.mkdir(parents=True,exist_ok=True);frames=stills/'.software-frames';frames.mkdir(exist_ok=True);directory=stills/'.scene-cache';directory.mkdir(exist_ok=True)
    sources=[*sorted((ROOT/'web3d/shibuya').glob('halloween*')),ROOT/'tools/export_shibuya_halloween_scene.mjs',ROOT/'tools/record_shibuya_halloween_software.py',ROOT/'tools/halloween_raster.c',ROOT/'tools/record_shibuya_halloween.py',ROOT/'web3d/data/shibuya_plateau.json',ROOT/'web3d/data/shibuya_osm.json']
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
        state=json.loads((directory/f'state-{frame:05d}.json').read_text())
        if state['comparison']:im=film.compare()
        elif state['credits']:im=film.credit(scene.render(directory/f'frame-{frame:05d}.bin'))
        else:im=film.frame(state,scene.render(directory/f'frame-{frame:05d}.bin'))
        if frame in STILLS:im.save(stills/STILLS[frame]);snapshots.append({'frame':frame,'video_seconds':frame/FPS})
        if not preview:
            temporary=path.with_suffix('.tmp');im.save(temporary,format='JPEG',quality=96,subsampling=0);temporary.replace(path)
        if frame%24==0 or preview:print(f'{frame/FPS:.2f}/{DURATION}s · CPU rendering actual three.js geometry',flush=True)
    probe=None
    if not preview:
        partial=output.with_name(output.stem+'.partial.mp4');subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate',str(FPS),'-i',str(frames/'frame-%05d.jpg'),'-frames:v',str(FPS*DURATION),'-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart+use_metadata_tags','-metadata',f'credit={CREDIT}','-metadata','comment=Toy-model values; same procedural three.js geometry, local CPU raster capture; paired replay at 6s; 18s loop.',str(partial)],check=True);probe=probe_video(partial);partial.replace(output)
    result={'video':str(output),'renderer':'authored CPU rasterizer of actual three.js scene','source_sha256':signature,'preview':preview,'width':1080,'height':1920,'fps':24,'duration_s':DURATION,'wall_seconds':round(time.monotonic()-start,2),'screenshots':[str(stills/p) for p in STILLS.values()],'snapshots':snapshots,'probe':probe,'errors':[]}
    (stills/('preview.json' if preview else 'recording.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--output',type=Path,default=Path('/workspace/demos/shibuya-halloween.mp4'));ap.add_argument('--stills',type=Path,default=Path('/workspace/demos/shibuya-halloween'));ap.add_argument('--metrics',type=Path,default=ROOT/'out/media/shibuya-halloween-metrics.json');ap.add_argument('--preview',action='store_true');args=ap.parse_args();record(args.output,args.stills,args.metrics,args.preview)
