"""The Halloween experiment has its own behavioural and capture regressions."""
import ctypes as C
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_actual_paired_halloween_experiment():
    subprocess.run(['node', str(ROOT/'web3d/shibuya/verify-halloween.mjs')], check=True, timeout=300)


def test_cpu_capture_depth_and_transparency(tmp_path):
    """A nearer triangle must occlude later far geometry and point sprites."""
    compiler = shutil.which('cc')
    if not compiler:
        pytest.skip('optional CPU recorder requires a C compiler')
    library = tmp_path/'raster.so'
    subprocess.run([compiler, '-O2', '-shared', '-fPIC', str(ROOT/'tools/halloween_raster.c'), '-lm', '-o', str(library)], check=True)
    lib = C.CDLL(str(library))
    ptr, integer, floating = C.c_void_p, C.c_int, C.c_float
    lib.triangles.argtypes = [ptr,ptr,integer,integer,ptr,ptr,integer,ptr,integer,integer,integer,floating,floating,floating,floating,integer]
    lib.points.argtypes = [ptr,ptr,integer,integer,ptr,ptr,integer,floating,ptr,integer,integer,floating]
    image = (C.c_uint8*(16*16*3))()
    depth = (C.c_float*(16*16))(*([float('inf')]*256))
    def triangle(inverse_depth, color, opacity=1):
        screen = (C.c_float*9)(1,1,inverse_depth,14,1,inverse_depth,7,14,inverse_depth)
        attrs = (C.c_float*18)(*(list(color)+[0,0,1])*3)
        lib.triangles(image,depth,16,16,screen,attrs,3,None,0,0,0,0,0,0,opacity,1)
    triangle(.5, (1,0,0))
    triangle(.25, (0,0,1))
    centre = (5*16+7)*3
    assert image[centre] > 200 and image[centre+2] < 20
    position = (C.c_float*3)(7,5,.25)
    green = (C.c_float*3)(0,1,0)
    lib.points(image,depth,16,16,position,green,1,16,None,0,0,1)
    assert image[centre] > 200 and image[centre+1] < 20
    triangle(1, (0,1,0), opacity=.5)
    assert image[centre] > 80 and image[centre+1] > 80


def test_halloween_recorder_shell_syntax():
    subprocess.run(['bash','-n',str(ROOT/'tools/record_shibuya_halloween.sh')],check=True)


def test_cpu_capture_uniform_instances_with_uvs(tmp_path):
    """Uniform-colour passenger rings may carry UVs and have multiple instances."""
    if not shutil.which('cc'):
        pytest.skip('optional CPU recorder requires a C compiler')
    # Use the recorder's system interpreter, which supplies NumPy and Pillow.
    interpreter = getattr(sys, '_base_executable', sys.executable)
    if subprocess.run([interpreter, '-c', 'import numpy, PIL'], capture_output=True).returncode:
        pytest.skip('optional CPU recorder requires NumPy and Pillow')
    subprocess.run([interpreter, '-c', r'''
import json, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path.cwd()/'tools'))
from record_shibuya_halloween_software import SoftwareScene
directory=Path(sys.argv[1])
positions=[-.5,-.5,0,.5,-.5,0,0,.5,0]
np.array(positions+[0,0,1]*3+[0,0,1,0,.5,1],dtype=np.float32).tofile(directory/'geometry.bin')
material=dict(color=[1,.65,0],emissive=[0,0,0],emissiveIntensity=0,opacity=1,basic=True,transparent=False,depthWrite=True,vertexColors=False,map=-1,emissiveMap=-1)
info=dict(object_stride=26,geometries=[dict(attrs=dict(position=dict(offset=0,count=9),normal=dict(offset=36,count=9),uv=dict(offset=72,count=6)))],objects=[dict(geometry=0,kind='instances',material=material)],textures=[],dynamic=[dict(object=0,instance_count=32)])
(directory/'scene.json').write_text(json.dumps(info))
projection=np.diag([1.5,2,1,1]);identity=np.eye(4)
values=[*projection.T.flat,*identity.T.flat,*identity.T.flat,1,2,1,.65,0,1,0,0,0,0]
for x in [-1,1]:
    transform=np.eye(4);transform[:3,3]=[x,0,-8];values.extend(transform.T.flat)
np.array(values,dtype=np.float32).tofile(directory/'frame.bin')
pixels=np.asarray(SoftwareScene(directory).render(directory/'frame.bin'))
amber=(pixels[:,:,0]>200)&(pixels[:,:,1]>100)&(pixels[:,:,2]<30)
assert amber[:,:540].sum()>1000 and amber[:,540:].sum()>1000, 'both uniform-material UV instances must render'
''', str(tmp_path)], cwd=ROOT, check=True, timeout=60)
