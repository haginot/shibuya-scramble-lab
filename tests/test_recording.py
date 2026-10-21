"""Recorder control flow can be tested without a browser or producing a movie."""
import io
import json
from pathlib import Path
import runpy
import subprocess
import sys
import time
import types

import pytest

SCRIPT = Path(__file__).resolve().parents[1]/'tools/record3d.py'


def run_recorder(monkeypatch, *, ready=True, exit_code=0):
    captions, writes, closed = [], [], []
    class Page:
        def on(self,*args): pass
        def add_init_script(self,script): pass
        def goto(self,url): pass
        def evaluate(self,source,args=None):
            if source == '!!window.__ready': return ready
            if args is not None: captions.append(args)
        def screenshot(self,**kwargs): return b'frame'
    class Browser:
        def new_page(self,**kwargs): return Page()
        def close(self): closed.append(True)
    class Playwright:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        chromium = types.SimpleNamespace(launch=lambda **kwargs:Browser())
    module = types.ModuleType('playwright.sync_api')
    module.sync_playwright = Playwright
    monkeypatch.setitem(sys.modules,'playwright',types.ModuleType('playwright'))
    monkeypatch.setitem(sys.modules,'playwright.sync_api',module)
    class Pipe:
        def write(self,value): writes.append(value)
        def close(self): pass
    class Encoder:
        stdin=Pipe()
        def wait(self): return exit_code
    monkeypatch.setattr(subprocess,'Popen',lambda *args,**kwargs:Encoder())
    monkeypatch.setattr(time,'sleep',lambda _:None)
    monkeypatch.setenv('CAPS',json.dumps([[0,'seed 0の1試行','one trial'],[.5,'平均と区間','means and intervals']]))
    monkeypatch.setattr(sys,'argv',[str(SCRIPT),'http://127.0.0.1/demo','unused.mp4','1','1280','720','4'])
    runpy.run_path(str(SCRIPT),run_name='__main__')
    return captions,writes,closed


def test_recorder_bilingual_captions_and_frame_count(monkeypatch):
    captions,writes,closed = run_recorder(monkeypatch)
    assert captions == [['seed 0の1試行','one trial'],['平均と区間','means and intervals']]
    assert writes == [b'frame']*4
    assert closed


def test_recorder_fails_when_viewer_never_ready(monkeypatch):
    with pytest.raises(RuntimeError,match='ready'):
        run_recorder(monkeypatch,ready=False)


def test_recorder_reports_encoder_failure(monkeypatch):
    with pytest.raises(RuntimeError,match='ffmpeg'):
        run_recorder(monkeypatch,exit_code=1)
