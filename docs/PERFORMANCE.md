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
