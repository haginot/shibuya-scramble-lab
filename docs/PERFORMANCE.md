# Performance / 性能測定

2026-10-21 · Chromium 156.0.8078.4 · Linux x86_64 · 1280×720 · device pixel ratio 1.
ANGLE / Vulkan SwiftShader (software GPU), headful Chromium on Xvfb.
This is a shared-workspace measurement; a local still capture and Pages build overlapped briefly. It is not a hardware-GPU benchmark.

| Agents | Mean FPS | Min–max FPS | Worker request latency, mean ms | Draw calls |
| ---: | ---: | ---: | ---: | ---: |
| 20,000 | 6.68 | 3.38–10.99 | 62.66 | 57 |

3 s warm-up; 180.474 wall seconds sampled every 0.5 s. Simulation advanced **181.1 s** within that interval.

| Progress / 進行 | Value |
| --- | ---: |
| ΔsimulationTime / ΔwallTime | 1.0035 |
| ΔwallTime − ΔsimulationTime (s) | -0.626 |
| Pending unsent time at last sample (s) | 0 |
| Latest acknowledged request latency p50 / p95 / p99 (ms) | 57.5 / 120 / 167.1 |

Observed phases: all-red, clearance, vehicles, walk. Train waves at end: JR 2, Ginza 1. The event window completed; browser errors: 0.

The lag value is a **change over the sampled interval**, not an absolute start-to-finish clock offset. A negative value can reflect catch-up of previously queued work and asynchronous sampling boundaries. The main loop retains all elapsed time and limits each request to 0.5 s; it can accumulate backlog under overload. The 4 FPS regression separately checks that ten wall seconds produce ten requested simulation seconds.

Latency includes messaging, batched 0.1 s steps, scheduling and snapshot copying. Percentiles describe the latest completed request seen at each 0.5 s observation, rather than all requests or per-step CPU time. FPS and throughput both depend on the browser, GPU, CPU and local load. The earlier six-second run did not cover signal/arrival events and is superseded by this measurement.

Agents use one GPU Points draw, individual CPU social-force motion in a Worker, typed arrays and a 2.5 m neighbour grid. This run drew 76,448 static/vehicle triangles. Neighbour interactions are capped at 32 and soft repulsion is bounded; see [CALIBRATION.md](CALIBRATION.md).

録画の30fpsは出力ファイルの時間基準です。本編30秒はシミュレーション時間×8、その後に12秒のクレジットが続きます。実時間で操作するときのFPSとは異なります。

Reproduce:

```bash
python3 tools/build_pages.py
uv run --with playwright python tools/benchmark_shibuya.py _site --agents 20000 --seconds 180 --min-sim-seconds 180
```

For each population the benchmark requests at least 180 wall seconds and 180 simulation seconds, capped at 3× the requested wall duration. `event_window_complete` marks whether signal and arrival windows were observed. `--agents 20000 40000` measures both populations; the table above reports only the completed 20,000-agent run.

Raw measurement: [performance.json](performance.json), also written to `out/media/shibuya-scramble/performance.json`. Recording log: `out/media/shibuya-scramble/recording.json`.

## Night renderer (branch `claude-3d`), 2026-10-22

Same sandbox class: Linux x86_64, 8 vCPU shared with other jobs (load average 13–18), **no hardware GPU** — Chromium 156 headless shell with ANGLE/SwiftShader software WebGL. These numbers bound the solver and describe the offline capture; they are not a hardware-GPU benchmark.

| Measure | Value |
| --- | ---: |
| Live agents (default `--agents auto`, 18:00) | 34,710 |
| Solver, Node 20, one core: 0.1 s step | ≈17 ms (≈170 ms per simulated second, ≈5.9× real time) |
| Draw calls / triangles per frame (all passes: reflection, trails, scene, bloom) | 55 / ≈6.5 M |
| People | one instanced draw for all bodies + one for umbrellas |
| Live FPS in software WebGL, 20 s sample | mean 0.94 (0.26–5.49) — software rasteriser, not representative of a GPU |
| Offline capture, 1,320 frames (39 s scene + 5 s credits) | median 2.5 s, p95 4.3 s per frame; 3,425 s wall in total |

The recorder (`tools/record_shibuya.py`) advances the solver by exactly `shot.speed/30` simulated seconds per frame and never uses wall-clock time, so the video does not depend on these speeds. Realised crossings in the recorded cycle: 1,840 completed on foot in the warm-up cycle, 0 rescued; arrivals refused by full corner queues are reported as `deferred` (≈250 per cycle at 18:00).
