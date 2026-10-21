# asagaya-town-sim

A small agent-based town simulation around JR Asagaya Station in Tokyo. Explore how a new café, an event, rain, or a different use of a station-side site changes activity within the model.

**This is an uncalibrated toy model, not a forecast.** Probabilities, opening hours, passenger profiles, and other coefficients are assumptions. Results do not predict real foot traffic, visits, or sales. Residents and their journeys are fictional; mapped place names come from OpenStreetMap and imply no affiliation.

[日本語 README](README.md) · [GitHub](https://github.com/haginot/asagaya-town-sim)

## Features

- Simulates 05:00–24:00 on roughly 400 m of neighborhood radius, with 410 mapped streets and 544 points of interest.
- Defaults to 400 residents, 350 arriving visitors, and 150 local commuters, averaged over five seeds.
- Compares four scenarios and three site alternatives: bicycle parking, café, or plaza.
- Models shortest-path walking, assumed opening hours, spontaneous visits, and station boardings/alightings.
- Provides a Japanese-language animated map, comparison tables, JSON metrics, and static HTML export.
- Optional LLM schedules and fictional reviews, with rule-based fallback.

## Install

The main package requires Python 3.9+ and has no runtime dependencies. Install from a local checkout:

```bash
python3 -m pip install .
```

With `uv` installed, run directly from GitHub once the repository is public:

```bash
uvx --from git+https://github.com/haginot/asagaya-town-sim.git asagaya-town-sim demo --no-llm
```

The older `prototype/` has separate dependencies; see its README.

## Usage

```bash
asagaya-town-sim demo --no-llm
asagaya-town-sim serve --no-llm
asagaya-town-sim demo --json --seeds 1 --no-llm
asagaya-town-sim build --no-llm -o out
```

`serve` opens the local UI at `http://127.0.0.1:8765/`; use `#compare` for comparisons. `build` writes `out/index.html` and `out/results.json`. The exported UI needs internet access for Leaflet and map tiles. The Python simulation runs offline with `--no-llm`.

## Configuration

Use `--residents`, `--visitors`, `--commuters`, and `--seeds` to change scale. `--record` controls recorded tracks; `--port` changes the local port; `--no-open` suppresses browser launch. See `asagaya-town-sim demo --help`.

LLM use starts automatically if `OPENAI_API_KEY` is set, unless `--no-llm` is supplied. It sends fictional persona and schedule prompts to the configured provider and may incur API charges. Keep credentials outside the repository.

| Setting | Default / purpose |
| --- | --- |
| `OPENAI_API_KEY` | Unset; optional provider credential |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1`; compatible API base URL |
| `ASAGAYA_LLM_MODEL` | `gpt-4o-mini` |
| `--llm-agents` | 8 residents |
| `XDG_CACHE_HOME` | `~/.cache`; responses stored in `asagaya-town-sim/llm.json` |

## License and attribution

Code: existing [MIT license](LICENSE), copyright © 2026 HAGINO, preserved as supplied. Map data in `src/asagaya_town_sim/data/asagaya_osm.geojson`: © OpenStreetMap contributors, licensed separately under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The map screenshots also contain OpenStreetMap cartography. See [OpenStreetMap attribution information](https://www.openstreetmap.org/copyright) and the [publication audit](PUBLISH_AUDIT.md) for remaining release issues.
