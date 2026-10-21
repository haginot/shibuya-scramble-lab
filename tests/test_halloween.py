"""The Halloween experiment has its own behavioural and capture regressions."""
import ctypes as C
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_actual_paired_halloween_experiment():
    subprocess.run(['node', str(ROOT/'web3d/shibuya/verify-halloween.mjs')], check=True, timeout=45)


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
