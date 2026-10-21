# Performance / 性能測定

2026-10-21, Chromium 156.0.8078.4, Linux x86_64, 1280×720, device pixel ratio 1.
ANGLE / Vulkan SwiftShader (software GPU), headful Chromium on Xvfb. These measurements are not hardware-GPU benchmarks.

| Individual agents | Mean FPS | Min–max FPS | Worker request latency (mean ms) | Draw calls |
| ---: | ---: | ---: | ---: | ---: |
| 20,000 | 8.53 | 6.89–10.64 | 27.43 | 57 |
| 40,000 | 7.84 | 5.92–8.71 | 59.72 | 57 |

3 s warm-up, 6 s sampling per population, one sample every 0.5 s. Concurrent local load and the software rasterizer affect FPS; no percentile or hardware guarantee is inferred.

Agents use one GPU Points billboard draw, individual CPU social-force motion in a Worker, typed arrays and a 2.5 m neighbour grid. About 76,000 static/vehicle triangles are drawn; adding agents adds points rather than solid-body triangles. The GPU map rendering is the main limit in this software-rendered run: 40,000 agents remain within 10% of the 20,000-agent FPS in this run. This is an inference from these two measurements, not a GPU profiler result.

Worker request latency includes messaging, any batched 0.1 s simulation steps, scheduling and snapshot copying; it is not per-agent or per-step CPU time. The main loop preserves pending simulation time, capped per request, and can fall behind real time under overload. Dense neighbour interactions are truncated at 32; see CALIBRATION.md.

録画の30fpsは出力ファイルの時間基準であり、この実時間FPSとは異なる。固定刻みで待ちながら全フレームを撮るため、録画処理は30秒より長くかかる。

Reproduce after a local build:

```bash
uv run python tools/build_pages.py --out /tmp/shibuya-site
uv run --with playwright python tools/benchmark_shibuya.py /tmp/shibuya-site --agents 20000 40000 --seconds 6
```

Raw measurement: `/workspace/demos/shibuya-scramble/performance.json`. Recording log: `/workspace/demos/shibuya-scramble/recording.json`. Machine-readable project copy: [performance.json](performance.json).
