> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-27). 기존 프로젝트(AntiGravt01) 기준 내용이며, 비밀번호 등 민감 문자열은 [REDACTED]로 바꿨다. 결론은 `docs/PLAN.md`에 반영되어 있다.

# Why every "real Earth" world map failed — evidence report

Scope: read-only investigation of `/home/user/AntiGravt01` (shallow history, root `c236501` 2026-06-07) and `/home/user/terra-in-cognita` (18 commits, 2025-09-25..29). No tracked file was modified.

Labels: **[V]** = verified in a file/line or commit; **[A]** = assumption/inference/outside knowledge (not provable from the repos).

Caveats on evidence quality
- The Leaflet/OSM/GPS client code (`terra-client/src/app/terrain-map`, `src/components/map/*`, `InternalBaseMap.tsx`, `OsmDebugOverlay.tsx`, `OsmTerrainService.js`) was deleted **before** the shallow root commit, so that era is known only from docs and leftover server code. [V: `git ls-tree -r c236501` lists none of them]
- `docs/archive/changelog_archive_2026-04.md` and `docs/archive/changelog_old.md` are mojibake (UTF-8 → CP949, one or two layers). File names, numbers and dates are readable; Korean prose is partly recoverable for single-layer lines (I decoded those with a cp949→utf-8 script) and unrecoverable for double-layer lines. These files were already corrupted in the root commit. [V]
- No document anywhere contains the literal complaint "해상도가 구려서" or names "resolution" as the reason the Earth map was abandoned. `git log --grep` and `git grep` for 해상도/resolution/earth/globe/지구 find nothing like that. [V] So the "why" below is reconstructed from code and docs. It is not quoted from a post-mortem.

---

## 0. TL;DR

1. Real-Earth data was only ever used in **one** attempt: the Leaflet "terrain-map" GPS mode (lat/lng, Open-Meteo elevation + OSM Overpass). Every later "world" is procedural noise. The `earth_v*.png` textures in `terra-client/public` are unreferenced 1024×1024 JPEGs. [V]
2. In that attempt, **one local tile ≈ one elevation-DEM pixel** (0.001° ≈ 111 m against a ~90 m DEM). A base map of 30×30 tiles therefore had no sub-tile detail. Terrain came from elevation thresholds only, and failed API calls silently returned "10 m" (PLAIN). The map looked like a coarse elevation raster. That is the most likely concrete meaning of "the resolution was bad". [V code; meaning A]
3. The PixiJS world that replaced it measures everything in **tiles**, not meters. Its noise frequencies, river widths and beach widths are fixed tile counts, and the tile→meter scale was **never decided**. Code and docs hold five contradictory values: 10 m, 150 m, ~1 km, 1.5 km, 111 m. [V]
4. Each world tile becomes a 150×150 local map that is synthesized from **one terrain enum plus 8 neighbours**, with elevation = bilinear ramp ± 2 m. Thin features such as rivers and coasts can't be narrower than one world tile. Coastlines become straight bands parallel to the tile edges, and adjacent local maps are not continuous. The server's copy of the generator has drifted from the client's (ICE_GROUND 52 vs 65, and 7 of 18 terrain recipes differ). [V]
5. If the map were real Earth at any proposed scale, it would need between **2.3×10⁸ and 2.3×10¹⁰ world tiles**. The largest implemented preset is 1024×512 = 5.2×10⁵, and the server cap is 4096×4096 = 1.7×10⁷. Fitted to 1024×512, Earth gives 39 km world tiles and 261 m local tiles, which contradicts the code's own "1 world tile = 150 m". [V arithmetic]

---

## 1. Chronological list of approaches

| # | When | Approach | Data source | Grid / projection | Resolution | Where it ran | World ↔ local relation | Status |
|---|---|---|---|---|---|---|---|---|
| A0a | 2025-09-28 | terra-in-cognita square-grid generator (`a8271ad`) | Simplex noise | square cells, no projection, no wrap | default 100×100 cells (`routes/worldmap.js` L349 `width = 100, height = 100`), each drawn as **1×1 px** on an 800×600 canvas (`CanvasMapRenderer.js` `fillRect(x, y, 1, 1)`), then CSS `scale(0.2–3)` | server gen + DB rows, client Canvas | none (single map) | replaced next commit [V] |
| A0b | 2025-09-29 | "Fantasy-Map-Generator 기반" Voronoi (`5a10433`) | random points + Simplex + radial island mask | Voronoi cells (d3-delaunay), 800×600 rectangle, no wrap, no lat/lon | **10,000 points** (`create-sample-map.js:31`) ≈ 48 px²/cell | server gen (`terrain-generator.js`), server SVG + client D3 contours | none | last commit of prototype [V] |
| A1 | before 2026-01 (date unknown) | "Hybrid map architecture", 4 renderers | DOM grid; D3 + TopoJSON `world-atlas` **110m**; Leaflet raster tiles (OSM, CartoDB Dark Matter); Three.js icosahedron wireframe globe | Mercator (`geoMercator`) for D3; Web-Mercator raster for Leaflet | `world-atlas` 110m = Natural Earth 1:110M country outlines [A for scale meaning] | client | — | doc only, code gone [V: `Consolidated_Map.md:173-281`] |
| A2 | ~2025-12 → 2026-03 | Leaflet "Terrain Map (Game Mode)" with **real GPS / lat-lng** | Open-Meteo elevation API (+DB cache), OSM Overpass (water/landuse polygons), later "HGT" planned | first "Sector-Tile" grid, then "No-Grid … 순수 위도/경도"; debug/local tiles of **0.001°** (≈111 m N-S, ≈88 m E-W at Seoul) | local base map **30×30 × 0.001° ≈ 3.3 km**; pathfinding grid 0.001°, cap 200×200 (~20 km); README pathfinding "1km 단위 … 지형 스캔"; GDD "1타일 = 14px (z18)" | server (Express calls Open-Meteo/Overpass), client Leaflet | local map centred on a **Command Center building** (`local_map_tiles.building_id`), not on a world tile | stopped (`CLAUDE.md:79,150` "⏸️ 중단"); GPS code removed 2026-03-26, OSM removed 2026-03-31 [V] |
| A3 | ≤2026-02-23 → now | PixiJS procedural world (`BiomeGenerator` V5→V7) | seeded value-noise fBm + ridge + continent masks; elevation/temperature/moisture layers | rectangle; **X wraps (cylinder), Y clamped at poles**; latitude = linear y (equirectangular-like) | presets 128², 256² (DB default), 512×256, 1024×512, 512², 800×400, custom; server clamps 32..4096 | **client** generates every tile (`WorldMapService.generateChunkLocally`); server stores only edited deltas (`pixi_map_tiles`) | each world tile → its own procedurally generated local map (A5) | active [V] |
| A4 | ≤2026-03-22 → now | Globe minimap | samples the A3 grid | inverse orthographic projection on Canvas 2D; u = lon/2π, v = lat/π + 0.5 | samples capped **360×180**, 200 px canvas | client | — | active (GDD lists "Globe 미니맵" as low-priority TODO, stale) [V] |
| A5 | ≤2026-04 (90×90) → 2026-04-26 (150×150) → now | SecondaryMap (Three.js) | derived from world tile terrain enum + 3×3 (+2-ring) neighbours | square 150×150 per world tile, 9 zones of 50 | 22,500 tiles + 2,400 border tiles = 24,900 meshes | **client** (generator + render), plus a **server JS copy** for resource logic | 1 world tile → 1 local map, seed = f(mapSeed, px, py) | active [V] |
| A6 | 2026-05-17 → now | Server-side re-generation (`ProceduralResourceHelper`) | same generators, hand-maintained JS copies in `terra-server/scripts/**` | — | — | server | must reproduce client local maps exactly (it doesn't) | active [V] |
| A7 | before 2026-06-07 | Earth textures `earth_v3_final.png`, `earth_v5_hyper.png`, `earth_v8_flat_tactical.png` | images (look AI-generated [A]) | v3 Mercator-like squashed into a square; v5 cropped (no Pacific/Australia); v8 labelled "EQUIRECTANGULAR PROJECTION", letterboxed in 1024², content rows ~170–853 | **1024×1024 JPEG** (misnamed .png) ≈ **39 km/px** if they span 360° | — | — | **unreferenced** anywhere in code [V] |
| (A8) | 2026-07 | Terra-Lite MapPage | text coordinates, no rendering | — | — | — | — | not an Earth attempt [V: `docs/Projects/terra-lite/TERRA_LITE_PLAN.md:184`] |

### Details per approach

**A0 — terra-in-cognita prototype** (`/home/user/terra-in-cognita`)
- The plan was to port Azgaar's Fantasy-Map-Generator. The repo has none of its Earth/heightmap import. [V `docs/map generator:4`, `:198-222` (FMG features all unchecked `[ ]`)]
- `server/terrain-generator.js:104-131`: `generate({ width, height, pointsNumber })` puts `pointsNumber` random integer points in the rectangle (not jittered, no relaxation), builds a Delaunay/Voronoi, and computes elevation per point from a radial "island" falloff plus 6-octave simplex at `scale = 0.005`. `voronoi` is never used in `generateElevation` (L133). There's a single centred island and no wrap or lat/lon. [V]
- Defaults are `width = 800, height = 600, pointsNumber = 10000` (`server/worldmap/worldmapController.js:280`, `create-sample-map.js:31`). Every point is a separate sequential `INSERT` (`worldmapController.js:343-349`, `create-sample-map.js:38-44`). [V]
- The client renderer `client/src/components/map/SvgMapRenderer.js:29-42` treats the scattered points as a dense grid. It builds a `uniqueX × uniqueY` array, about 801×601 = 481,401 cells, of which only 10,000 (2.1%) get a value. The rest stay `undefined` before `d3.contours`. [V code; 2.1% from simulation]. The rendered result would be sparse speckles or garbage contours. [A]
- Server SVG: `generateSvgFromData` calls `this.drawTerrainLayer(svg, …)` (L565) without using a return value. Inside, `svg += …` only changes the local string copy, so the terrain layer never reaches the SVG output. When it ran, it drew `1×1` rects per point (L604). [V]
- Earlier version (`a8271ad`) used a 100×100 grid drawn at 1 px per cell and then CSS-scaled, which is literally a low-resolution picture. [V]
- There was no Earth data in this repo. [V]

**A1 — hybrid map doc** (`docs/GDD/Map/Consolidated_Map.md:173-281`)
- GlobalMap: "`world-atlas` (110m 해상도 국가 경계 데이터)" (L207), "D3의 `geoMercator` 투영법" (L209). [V]
- TerrainMap: Leaflet, "OpenStreetMap & CartoDB Dark Matter tiles" (L231). Downside: "이미지가 미리 만들어져 있어야 하므로, 플레이어가 지형을 실시간으로 바꾸거나 생성하는 게임에는 적용하기 어렵습니다. 커스텀 타일 서버 구축 비용이 큽니다." (L241) = "images must be pre-rendered, so it doesn't suit a game where players change or generate terrain; a custom tile server is expensive". [V]
- 3D globe: `WorldMapPanel.jsx -> public/world_globe.html`, a Three.js icosahedron wireframe with bloom (L252-256). The doc recommends "LOD … QuadTree 기반 구체 … 심리스 행성 착륙 (No Man's Sky 방식)" (L269) as the way to scale. That was never implemented. [V]
- DOM grid: "DOM 요소가 많아지면(예: 100x100 이상) … 대규모 맵에는 부적합" (L194). [V]

**A2 — Leaflet/GPS real-Earth game mode**
- README (still in repo) describes it: "Terrain Map (Game Mode): Leaflet 기반의 위성 지도/지형 모드", "GPS Tracking" (README.md:171-172); "Real Elevation: Open-Meteo API" (L185); "고도에 따라 ⛰️ 산맥(>1000m), 🌲 평야/숲(0~1000m), 🌊 바다(<=0m)" (L186); "No-Grid System: 기존의 그리드(Sector-Tile) 방식을 완전히 제거하고, 순수 위도/경도(Lat/Lng)" (L191); "Smart Pathfinding … 1km 단위의 고해상도 지형 스캔 … 작은 강이나 호수도 정밀하게 감지" (L192); speeds "Admin 1km/s, User 0.1km/s" (L194-196); territory radius 5 km (L180). [V]
- Leftover server code:
  - `terra-server/game/world/ElevationService.js`: Open-Meteo `https://api.open-meteo.com/v1/elevation` (L25). DB cache `elevation_cache(lat,lng)` (L47-60) with 6-decimal key matching. Batches of **100 points** (L77) and a **2,000 ms sleep after every batch** (L91), 5 s timeout. Any failure becomes **10 m** (L120-128). It does **not** read `.hgt` files. [V]
  - `terra-server/game/world/TerrainManager.js:101-133`: elevation-only classes `ROCK ≥200 m`, `MOUNTAIN 100–199 m`, `WATER ≤0.5 m`, else `PLAIN`. Its own header comment (L11-15, L76-95) says `<0 WATER / ≥1000 MOUNTAIN`, and the README says >1000 m. Docs and code disagree. [V]
  - `terra-server/game/world/WaterService.js:16-66`: Overpass query for `natural=water`, `reservoir`, `riverbank` in a ±0.03° box, `timeout:5`. On error it returns `[]` (no water). [V]
  - `terra-server/game/movement/PathfindingService.js:12-13,166-185`: A* on a 0.001° grid, aborting if >200×200 ("~20km 제한"). It fetches elevation for every grid node. [V]
  - `terra-server/utils/geo/localMap.js:15-39`: `GRID_SIZE = 30`, `GRID_STEP = 0.001` ("약 100m 간격"), grid centred on a building's lat/lng and written into `local_map_tiles(building_id, grid_x 0..29, …)` (`database_init/schema.js:1420-1432`). [V]
  - **Second, divergent copy**: `terra-server/routes/building/building_mgmt_routes.js:13-29` inline `generateLocalMap` with `GRID_STEP = 0.00001` (≈1.1 m), a 100× finer step. Its 30×30 grid spans ≈33 m, so all 900 samples fall inside one ~90 m DEM pixel and the result is flat and uniform. [V code; DEM pixel size A]
- Doc of the hard-coded values (`docs/GDD/World/Consolidated_World.md:497-514`, the merged `WLD-1_MapSystem.md`): "디버그 타일 크기 `0.001°` ≈ 111m", "격자 크기 `30×30` 타일", "타일 간격 `0.001°` ≈ 111m", "전체 영역 ≈ 3.3km × 3.3km", "높이 축소 비율 `1/10` (10m = 1 unit)". It also lists the OSM+elevation hybrid (L518-592), the client conversion `tile.height = Math.floor(elevation / 10)` (L617), and "CONCRETE/Urban은 수집되지만 분류 단계에서 건너뜁니다" (L578). [V]
- GDD §8 is still written for this era: "1차 맵 (World Map) | Leaflet.js | … | 1타일 = 14px (z18)" and "2차 맵 … 1타일 = 64px" (`docs/Projects/terra_in_cognita/Game_Design_Document.md:1422-1423`). "OSM 데이터 … + HGT 고도 데이터 → … 19종 지형" (L1428-1436). "✅ OSM + 고도 데이터 파이프라인" (L1442). Core concept: "'끝없이 넓은 지구'", "현실 지구 지형 기반 맵" (L34-35), "지구와 동일한 지리를 가지되 탐험되지 않은" (L56). [V]
- The HGT plan exists only in docs. `docs/archive/NAS_DEPLOYMENT.md:19-26` says "Download SRTM HGT files for your region (e.g., `N37E126.hgt` for Seoul)… It will auto-detect the files". `docs/ARCHITECTURE.md:368-369` says "`ElevationService.js` | HGT 고도 데이터 파싱". `TF-002_FeatureList.md:442` says "HGT 고도 데이터 처리 ✅ 구현". No code anywhere reads `.hgt` (git grep), and `terra-data/elevation/` is git-ignored (`.gitignore:39`) and absent. [V]
- Volume actually fetched: `elevation_cache` had **61,022 rows** in SQLite (59,645 after de-duplication) at the PG migration (`docs/Engineering/Infrastructure/DB_MIGRATION_POSTGRESQL.md:920-923`). [V] At 0.001° spacing that is roughly 700 km² of coverage at most. [A]
- End of the era:
  - 2026-03-23: terrain-map APIs marked `@deprecated`. [V: `changelog_archive_2026-04.md:3852` filenames]
  - 2026-03-26: "server.js GPS(terrain-map) … 삭제". `GET /api/npcs` switched from GPS lat/lng to `unit_positions` tile_x/tile_y, Haversine was replaced by tile distance, and `getDistanceFromLatLonInKm`/`deg2rad` were deleted. [V: `changelog_archive_2026-04.md:3401-3409`, partly decoded]
  - 2026-03-31 "CLN-01 … (Legacy) OSM …": deleted `terra-server/game/OsmTerrainService.js`, `scripts/maintenance/download_osm_region.js`, `terra-data/osm/`; modified `TerrainManager.js` and `routes/game_routes.js`. The prose mentions BiomeGenerator (the replacement) but is otherwise unrecoverable. [V: `changelog_archive_2026-04.md:2085-2094`]
  - Benchmarking analysis: "`terrain-map`과 `pixi-map`은 완전히 다른 별개의 맵 시스템 … terrain-map의 기존 15개 건물 … 은 **중단된 시스템**이며, 이 문서와 어떠한 연동도 없다" (`docs/Engineering/Benchmarking/Analysis/Consolidated_Analysis.md:483-485`). [V]
  - DB schema doc: "`local_map_tiles` | Leaflet 기반 로컬 맵 타일 (중단 상태)" (`docs/DATABASE_SCHEMA.md:135`). [V]
  - **Leftovers still wired in**: `routes/game_routes.js:373` and `routes/building/building_mgmt_routes.js:43` still call `generateLocalMap(id, x, y)` with PixiMap integer tile coordinates as lat/lng. [V] For x>90 the lat is invalid, the API fails and the fallback is 10 m → PLAIN. [A]

**A3 — PixiJS procedural world** (`terra-client/src/components/WorldMap/core/`)
- `BiomeGenerator.ts`:
  - Noise frequencies are absolute per tile: fBm starts at 0.015/tile (L57), ridge at 0.012 (L73), continent masks at 0.008–0.06 (L219-297), lakes 0.06 ("주기 17타일", L525-546). Rivers are "최대 1~2타일 두께" (L574). Beaches come from `isNearWater(x,y,5)` = within 5 tiles (L475-476). No parameter is in meters.
  - Seamless X via a 15% smoothstep blend (L120-137).
  - Latitude is `ny = y / mapHeight` (L315-320), a linear equirectangular-style mapping.
  - Elevation meters = normalized × `maxElevation` (default 4000 m, `types.ts:125-138`) (L208-216). [V]
- `WorldMapService.ts`: the client generates chunks itself (`getChunk` → `generateChunkLocally`, L172-200). It only preloads edited tiles from `/api/piximap/tiles/:mapId` (L115-132). X wraps by modulo, Y is bounded (L105-113). `getTerrainAtStatic` defaults `mapWidth = mapHeight*2` when not given (L63), which would make a non-2:1 map generate different terrain. [V]
- `types.ts:213-225`: `CHUNK_SIZE 32`, `TILE_SIZE 16` px, `MINIMAP_SIZE 200`. Size presets are at `types.ts:141-149`. DB default is 256×256 (`database_init/schema.js:2084-2095`). The server clamps to 32..4096 (`routes/map/piximap_routes.js:52-53`). Width/height can't be changed after creation (PUT only updates name/seed/config, L71-94). [V]
- Doc drift: `Consolidated_Map.md:1188` says a "10%" wrap blend while code uses 15%, and L1191 says "16x16 … 청크" while code uses 32. [V]

**A4 — globe minimap** (`terra-client/src/components/WorldMap/shared/MiniMap.tsx`)
- It samples at most `360 × 180` points of the tile grid (L145-147, L328-329) and projects them by inverse orthographic projection with `v = lat/π + 0.5` (L355-365). The concept doc is `Consolidated_Map.md:497-612`.
- Its recorded failures are about **seams, not resolution**: "❌ 실패 1: 노이즈만 래핑 … 대륙이 경계에서 끊김" and "❌ 실패 2: cos(θ) 원통형 좌표 … 맵 전체가 좌우 대칭" (L616-632). Fixes are in the 2026-03-26 changelog entries (`changelog_archive_2026-04.md:3282-3322`). [V]

**A5 — SecondaryMap 150×150** (`terra-client/src/components/SecondaryMap/`)
- `types.ts:10-28`: `GRID_SIZE 150`, `ZONE_SIZE 50`, `TILE_WORLD_SIZE 1.0`, `ADJACENT_BORDER_SIZE 4`, `ELEVATION_SCALE 0.12`. The header comment still says "90×90" (L3). [V]
- `SecondaryMapGenerator.ts`:
  - seed `calcSecondaryMapSeed(mapSeed, px, py)` (L565-567, L594).
  - Elevation = `bilinear3x3` over the centre and the mid-points to its 8 neighbours, plus `±2 m` noise (L602-616, L675-678).
  - Terrain = weighted random pick from per-enum recipes (L132-305), blended toward neighbours near the edges (L697-725).
  - Water: if the centre world tile is water, **every** pixel is water (`isCoastWater` L70). A land tile next to water gets a band about `gs/6 = 25` tiles deep, measured as distance to the tile edge, with ± noise (L73-99). [V]
- Neighbour preview `generateAdjacentEdges` regenerates the neighbour with `preset = undefined` (L827-836). The real neighbour map uses the active preset (L589-592). [V]
- Elevation in 3D = `(tile.elevation - primaryElevation) * 0.12` (`SecondaryMapRenderer.ts:559`). [V]
- History:
  - 90×90 → 150×150 on 2026-04-26. Hard-coded `90`/`89` had to be fixed in BuildingGatherEngine, FieldGatherEngine, WorkerMovementEngine and `seed_secondary_map_resources.js` (`changelog_archive_2026-04.md:222`). On 2026-05-10, "Replaced all hardcoded `89` boundary logic checks with `SECONDARY_MAP_CONFIG.GRID_SIZE - 1` to properly support the 150x150 map expansion" (L4585), along with `building_routes.js MAP_SIZE 90`, `minion_gather_routes.js`, `piximap_routes.js`, `AiConstants.js` (`changelog_old.md:338-341`). [V]
  - 2026-05-11: a NaN elevation from an un-merged old config made "2차맵 지형 반갈(Split)"; half the meshes fell to the floor (`changelog_archive_2026-04.md:4604-4608`, decoded). [V]

**A6 — server re-generation**
- `terra-server/game/gather/ProceduralResourceHelper.js:22-31` requires `scripts/WorldMap/core/BiomeGenerator.js` and `scripts/SecondaryMap/SecondaryMapGenerator.js`, which are hand-maintained compiled copies. [V]
- It was introduced on 2026-05-17 because "클라이언트에서는 자원이 보이나 서버에서는 '자원 없음' 오류" (`changelog_archive_2026-04.md:4612-4619`, decoded). [V]
- The server copy was edited by hand on 2026-05-24 (DEAD_TREE→WOOD, GRAVEL→STONE, FOREST ROCK 5%, GRASS 50→45%) (`changelog_old.md:1384-1387`, filenames + numbers readable). [V]

---

## 2. Why each was abandoned or judged a failure, by category

### (a) Source-data resolution too coarse
- **A2 local map ≈ 1 DEM pixel per tile.** The 0.001° tile (111 m) is about one sample of the elevation source. `localMap.js:17`, `PathfindingService.js:173-174`. [V] Open-Meteo's elevation API is backed by Copernicus GLO-90, roughly 90 m. [A, outside knowledge] So a 30×30 base map is a 30×30 elevation raster with zero sub-tile detail. Height is quantized to 10 m steps (`Consolidated_World.md:512, 617`). [V]
- **Classification from elevation alone, with 3–4 classes.** ROCK/MOUNTAIN/WATER/PLAIN (`TerrainManager.js:101-133`). OSM landuse was removed on 2026-03-31, and Urban was dropped even before that (`Consolidated_World.md:578`). [V] Most inland Korea above 200 m becomes uniform ROCK. [A]
- **Silent fallback to 10 m.** Any API failure returns PLAIN (`ElevationService.js:120-128`), and Overpass failure means "no water" (`WaterService.js:62-65`). [V]
- **Inline local map with 1.1 m steps.** That is finer than any DEM, so the result is a flat, featureless map (`building_mgmt_routes.js:15`). [V code; flat result A]
- **1 km pathfinding scan** (README.md:192) is claimed to detect "작은 강이나 호수" (small rivers and lakes). Sampling at 1 km cannot do that. [V doc; A conclusion] It was later replaced by a 0.001° A*.
- **Global layers**: `world-atlas` 110m outlines (`Consolidated_Map.md:207`). 1024×1024 Earth JPEGs give about 39 km per pixel. [V arithmetic]
- **A0**: a 100×100 grid at 1 px per cell, CSS-scaled; then 10,000 random points over 800×600 (2.1% grid fill in the renderer). [V]
- **A3/A5 (procedural)**: there is no source data. A 150×150 local map gets exactly **one** terrain enum + temperature + moisture + elevation from its world tile, plus 8 (and 8 second-ring) neighbours. Everything inside is RNG. The GDD backlog says so: "현재 1차맵 기반으로 2차맵 생성 시 산지 등 특정 지역이 너무 넓고 단조롭게 전개됨 (픽셀 노이즈 고정 단점)" (`docs/GDD/Consolidated_GDD.md:301-303`) = "2nd maps generated from the 1st map make some areas (mountains) too wide and monotonous (fixed pixel noise)". [V]

### (b) Projection distortion (poles / equirectangular / Mercator)
- A3 latitude is linear in y (`BiomeGenerator.ts:315-320`), X wraps and Y is clamped (`Consolidated_Map.md:1321-1328`). The globe maps `v = lat/π + 0.5` (`MiniMap.tsx:360`). On a sphere, the whole top row of 1024 tiles collapses onto the pole, and every row gets the same tile count regardless of latitude. [V code; geometric consequence A]
- Every world tile spawns the **same** 150×150 local map whatever its latitude. If Earth-scaled, a tile at 80° covers about 0.17× the east–west distance of an equatorial tile, so local-map area and travel distance would be wrong by up to 6×. [A]
- A2's 0.001° grid is non-square: about 88 m × 111 m at 37.5°N (cos φ). That's the "양축 반전 (등각 보정)" hack in `localMap.js:24-31`. [V code; metres A]
- A1 used `geoMercator` (`Consolidated_Map.md:209`). `earth_v3_final.png` visually shows Mercator-style polar inflation (Greenland and Antarctica huge), and `earth_v8` is a non-2:1 image letterboxed inside a square. [V image/measurement; projection identification A]
- **Not documented as a reason** anywhere. The only documented "failures" of the globe/wrap work are seams (`Consolidated_Map.md:616-632`). [V]

### (c) Mismatch between world tile and local map (scale, seams, generator mismatch)
- **Thin features are one world tile wide.** Rivers are "1~2타일 두께" in world tiles (`BiomeGenerator.ts:574`), and a RIVER world tile becomes an all-water 150×150 local map (`SecondaryMapGenerator.ts:70, 686-694`). A river is therefore ≥150 local tiles wide. [V] That is ≥150 m at 1 m/tile, or ≥1.5 km at 10 m/tile. [A arithmetic]
- **Coastlines follow tile edges.** The water band is measured from the local-map edge (`dTop/dBot/dLeft/dRight`, L82-91), so world-tile staircase coastlines show up as straight shores. [V]
- **Seams.** Each local map has its own seed (`calcSecondaryMapSeed`, L565-567). Object placement and coastline noise (`isCoastWater(x, y, seed, …)` L682, local coordinates) are not continuous across the shared edge; only elevation is (mid-point rule, L602-616). The neighbour border preview ignores presets (L831). Walk-to-edge transitions needed a special animation workaround (`Consolidated_World.md:681-689`). [V]
- **Generator drift client ↔ server** (`SecondaryMapGenerator.ts` vs `terra-server/scripts/SecondaryMap/SecondaryMapGenerator.js`). Per-terrain recipe comparison [V]:

  | Primary | client TS | server JS (used by `ProceduralResourceHelper`) |
  |---|---|---|
  | ICE | ICE_GROUND **65**, SNOW 26, ROCK 6, DEAD_TREE 1, MOSS 2 (L168-172) | ICE_GROUND **52**, SNOW 20, ROCK 12, MOSS 8, DEAD_TREE 5, GRAVEL 3 (L139-144) |
  | BEACH | SAND 89 … (L177) | SAND 68 … (L149) |
  | GRASS | GRASS 80 … (L187) | GRASS 58 … (L160) |
  | GRASSLAND | GRASS 55 … (L196) | GRASS 40 … (L170) |
  | DESERT | SAND 81 … (L229) | SAND 62 … (L205) |
  | SNOW | SNOW 75 … (L250) | SNOW 58 … (L228) |
  | SCRUB, WETLAND | differ | differ |
  | MOUNTAIN/ROCKY_MOUNTAIN | merged case | separate case |
  | FOREST, JUNGLE, SWAMP, TUNDRA, LAKE, RIVER, DEEP_WATER | same | same |

  - A third copy, `terra-server/scripts/SecondaryMapGenerator.js`, has ICE 65 (L136) but is not required by anything. [V]
  - Docs give a fourth version: `Consolidated_Map.md:1263` says "IceGround(65%), SnowGround(25%), Rock(10%)", and MOUNTAIN "Rock(40%), Gravel(28%), Cliff(18%)…" (L1269) matches neither copy. [V]
  - The documented symptom is that the server says "no resource" where the client shows one (`changelog_archive_2026-04.md:4614`). [V]
  - Both server engines use the same random positions with different weights, so they pick different terrain on the same tile. [A, follows from code]
- **Size change pain**: the 90→150 refactor of hard-coded constants across many server files (see A5). [V]
- **Legacy local maps were per-building**, not per world cell (`local_map_tiles.building_id`). Two bases 1 km apart would have generated overlapping, independent maps. [V schema; consequence A]

### (d) Performance / loading
- **Open-Meteo throttling.** 100 points per call plus a 2 s sleep (`ElevationService.js:77, 91`):
  - 30×30 local map = 9 calls ≈ 18 s on a cold cache.
  - A 20 km path segment (200×200 = 40,000 nodes) = 400 calls ≈ **800 s** on a cold cache.
  - The debug overlay allowed radius up to 150 (`Consolidated_World.md:502-504`).
  [V code, arithmetic]
- **Overpass**: 5 s timeout, cache keyed by the box's min corner only (`WaterService.js:18, 23`). [V]
- **Pathfinding hard cap** about 20 km per segment (`PathfindingService.js:178-184`). [V]
- **2nd map freeze >1 min.** "2차맵(Three.js, 150×150 = 22,500타일)" (`docs/2026-10-26_…분석보고서.md:98`). Causes: O(N²) `updateTile` over 24,900 meshes (L104-112), individual meshes plus a full raycast (L118-123), the whole 150×150 map regenerated 4× just to get borders (L125-130), N+1 server queries, and a serial fetch waterfall. Fixed on 2026-10-26 (`docs/changelog.md:1-22`, commit `0ea5299`). [V]
- Server re-generation was slow enough that its search radius was cut from ±2 to ±1 and the cache TTL raised from 60 s to 600 s (`changelog_archive_2026-04.md:4621-4625` and the following 2026-05-17 entries). [V]
- A0: 10,000 sequential INSERTs per generation, and a server-built SVG string. [V]
- A1 notes SVG and DOM performance limits (`Consolidated_Map.md:194, 217`). [V]

### (e) Tile-to-meter scale never decided — strongest documentary evidence
- `docs/GDD/Map/Consolidated_Map.md:1369` `const TILE_TO_METER = 10; // ⚠️ 확정 필요`, and L1374 "`TILE_TO_METER` 스케일 상수는 맵 설정(1차맵 1타일 = 실제 N미터) 확정 후 …" ("after the map setting (1st-map 1 tile = N real metres) is decided"). [V]
- `docs/GDD/Building/archive/BLD-1_BuildingGated_Navigation.md:661, 670, 704`: "1차 맵 1타일이 현실의 몇 미터에 해당하는지 … 확정 필요. 현재 임시값 `10`"; open item "1 타일 = 몇 미터인지 확정 필요". [V]
- Code uses, at the same time [V]:
  - `terra-server/routes/map/piximap_routes.js:1520-1521`: "1차맵 1타일 = 2차맵 150×150 = 150m", `TILE_TO_METER = 150` (implies 1 local tile = 1 m).
  - `terra-server/game/territory/TerritoryEngine.js:89-90`: "2차맵 … (1타일 = 10m)" (implies 1 world tile = 1.5 km).
  - `terra-server/ai/NpcTileUtils.js:72-75`: "1타일 = 대략 1km로 간주" ("180 km/h = 180 타일 / 60분"); `ai/NpcManager.js:399-400`: `tilesPerMin = speedKmh / 60`.
  - Leaflet era: 0.001° ≈ 111 m (`Consolidated_World.md:502, 510`).
  - GDD: "1타일 = 14px (z18)" (`Game_Design_Document.md:1422`). [V] At z18, 14 px ≈ 6.6 m at 37.5° or 8.4 m at the equator. [A arithmetic]
  - `SECONDARY_MAP_CONFIG.ELEVATION_SCALE = 0.12` with `TILE_WORLD_SIZE = 1.0` (`types.ts:16-20`) implies a vertical scale that depends on the unknown horizontal one.
- A3's generator parameters are in tiles (see A3), so even the procedural world has no physical scale to tie to Earth data. [V]

### (f) Other
- **Docs and code disagree about data sources.** ARCHITECTURE/NAS/TF-002/GDD say HGT is implemented and auto-detected, but the code is Open-Meteo only (see A2). The README says MOUNTAIN >1000 m; the code says ≥100 m / ROCK ≥200 m. [V]
- **Static raster tiles don't fit a mutable game world.** This was explicitly noted (`Consolidated_Map.md:241`). [V]
- **Wrapping/seam bugs** in the procedural world (`Consolidated_Map.md:616-632`). [V]
- **Lake bug.** "호수가 바다보다 커지는 문제" ("lakes bigger than the sea") was fixed by retuning tile-unit frequencies (`BiomeGenerator.ts:523-528`). This is another symptom of scale-free, tile-unit tuning. [V]
- **Product shift.** By the 2026 GDD, gameplay centres on 2nd-map bases, gathering and minions. The world map shows only faction overlays and has no building UI (Benchmarking analysis L495-499). [V] The Earth data stopped mattering to gameplay. [A]

---

## 3. Required scale vs. physical consistency with real Earth

Inputs: Earth surface 5.10×10¹⁴ m², land 1.49×10¹⁴ m², equator 40,075 km, pole-to-pole 20,004 km. [A, standard constants]

| Source of the scale | World tile | Local tile (÷150) | Earth world tiles (by area) | Equirect grid | Land-only world tiles |
|---|---|---|---|---|---|
| `piximap_routes.js:1521` (150 m) | 150 m | 1 m | **2.27×10¹⁰** | 267,167 × 133,360 = 3.6×10¹⁰ | 6.6×10⁹ |
| `NpcTileUtils.js:72` (~1 km) | 1 km | 6.7 m | 5.1×10⁸ | 40,075 × 20,004 = 8.0×10⁸ | 1.5×10⁸ |
| `TerritoryEngine.js:89` (local 10 m) | 1.5 km | 10 m | 2.27×10⁸ | 26,717 × 13,336 = 3.6×10⁸ | 6.6×10⁷ |
| Leaflet era 0.001° | ≈111 m | (30×30 per base) | 4.1×10¹⁰ | 360,000 × 180,000 = 6.5×10¹⁰ | 1.2×10¹⁰ |
| `Consolidated_Map.md:1369` (10 m, "확정 필요") | 10 m | 6.7 cm | 5.1×10¹² | — | — |

Implemented sizes, and what they mean if they are Earth [V presets; A arithmetic]:

| Preset | Tiles | World tile if whole Earth | Local tile (÷150) |
|---|---|---|---|
| 256×256 (DB default) | 65,536 | 156.5 km × 78.1 km (non-square) | 1,044 m × 521 m |
| 512×256 | 131,072 | 78 km | 522 m |
| 1024×512 (largest preset) | 524,288 | **39.1 km** | **261 m** |
| 4096×2048 (within server cap) | 8.4 M | 9.8 km | 65 m |
| 4096×4096 (server cap) | 16.8 M | 9.8 × 4.9 km | 65 × 33 m |

Consistency verdict [A, derived]:
- The "150 m world tile" in code is irreconcilable with a full Earth on any implemented grid. It needs about **43,000×** more tiles than 1024×512, or about **1,350×** more than the 4096² cap.
- With 1024×512 as Earth, world tiles are 39 km. A single terrain enum per 39 km cell is a continent-scale raster. Local tiles become 261 m, which is coarser than real DEMs: SRTM1 ≈ 31 m, SRTM3 ≈ 93 m, Copernicus 30/90 m. [A] Data resolution isn't the bottleneck there; the **world grid** is.
- At the human-scale local maps the game actually renders (1–10 m tiles with trees and buildings), every global DEM is 3–90× too coarse. Local maps must be **synthesized** regardless, which is what A5 already does. The Leaflet era tried to show raw ~100 m data as the local map, and that is where it looked bad.
- A 1 km–1.5 km world tile (2–5×10⁸ tiles) is the only proposed scale where storing a real-Earth world raster is plausible: 26,717×13,336 × 2 B ≈ 0.7 GB, or a cube-sphere equivalent. [A] Even then, local 150×150 maps at 7–10 m need 3–10× procedural upsampling of SRTM1/GLO-30.
- Storage of raw DEMs: SRTM1 tile 3601² × 2 B = 25.9 MB, SRTM3 1201² × 2 B = 2.9 MB per 1°×1°. SRTM covers only 60°N–56°S. [A, outside knowledge]

---

## 4. Existing planet/map editor or generator tooling

1. **`/admin/editor/world-map-editor`** (`terra-client/src/app/admin/editor/world-map-editor/page.tsx`, `components/WorldMap/editor/WorldMapCanvas.tsx`, `EditorToolbar.tsx`) [V]:
   - Create, edit, delete and activate `pixi_maps` (`WorldMapCanvas.tsx:125, 613-662` → `/api/piximap/maps…`).
   - Size presets (`types.ts:141-149`), custom W×H (server clamp 32..4096), seed.
   - BiomeConfig sliders: min/max elevation, min/max temperature, water %, ridginess, lake %, river % (`EditorToolbar.tsx:101-111`).
   - Continent type: pangaea, continents, supercontinent_split, two_continents, ring, archipelago, scattered, waterways (L496-509).
   - Latitude/climate mode: symmetric, asymmetric, tropical_belt, ice_age, hot_world, random (L513-524).
   - Highland placement and a random-config button (L197-219).
   - Live preview canvas with Biome/Height/Temp/Moisture layer views and tile counts (L120-124, L257-343).
   - Brush painting of 20 terrain types and 5 resources, with X wrap (L57-92; doc `Consolidated_Map.md:1201-1203`). Deltas are saved via `POST /api/piximap/tiles` (`WorldMapService.ts:230-238`).
   - Enter a tile's 2nd map in editor mode (world-map-editor `page.tsx:84-107`).
   - **Cannot**: import heightmaps, images or DEM/HGT; work on a sphere or cube-sphere; change dimensions after creation (PUT ignores size, `piximap_routes.js:71-94`); export. Changing seed/config regenerates everything and may orphan painted deltas (`EditorToolbar.tsx:491` note, `Consolidated_Map.md:1206`).
2. **`/admin/editor/pixi-editor`** (2nd-map tuner) [V]:
   - For each primary terrain type: simulate a 3×3 neighbourhood; tune primary/secondary blend, coastline noise, cluster factor, per-terrain `weightsOverrides` and `extraTerrains` injection.
   - See the default recipe and distribution; save or apply presets via `/api/admin/piximap/presets[/apply]` into `secondary_map_presets`. These are consumed by `/api/piximap/presets/:mapId` and the server `ProceduralResourceHelper`.
   - `ObjectCheatSheetTab.tsx` previews the 3D objects.
   - (`pixi-editor/page.tsx:1-80, 96-262`)
3. **Globe minimap** viewer toggle (A4). It's a viewer, not an editor. [V]
4. **Leaflet-era admin tools** (doc only): "Admin Terrain Editor: … 특정 타일의 지형을 강제로 변경" (README.md:187) via the `tile_overrides` table (`schema.js:1389-1402`). [V]
5. **terra-in-cognita**: admin map CRUD plus `POST /worldmap/:mapId/generate-terrain` with `{width, height, seed, pointsNumber}` (`docs/map generator:131-139`, `worldmapController.js:273-298`). [V]

No tool anywhere imports real-Earth rasters or creates multiple planets. "Planet" exists only as a single `pixi_maps` row with `is_active`. [V]

---

## 5. Constraints the new design should satisfy (derived from the failures) [A]

1. **Fix the scale first, in one constant, before choosing data.** Every past attempt either lacked a scale or had several. Pick world-cell size, local-cell size and the vertical scale together.
2. **Use a sphere-native world grid** (cube-sphere or icosahedral/HEALPix-style) instead of an equirectangular rectangle. Pole pinch and latitude-dependent cell area then disappear. Keep X-wrap only for 2D projections.
3. **Store real Earth only at world-cell resolution** (≈1–10 km: DEM aggregate, land/ocean mask, biome/climate class from a global land-cover product). **Synthesize** local maps from those fields with continuous, globally seeded noise in world coordinates, not per-tile seeds. That removes seams and lets rivers and coasts be thinner than a world cell.
4. **Represent rivers, coasts and roads as vectors** (simplified OSM / Natural Earth / HydroRIVERS), rasterized at local-map resolution, not as world-tile classes.
5. **Make one generator implementation the source of truth for client and server.** Use a shared package or WASM, or generate on the server and stream. Add a golden-test that hashes generated local maps to catch drift like ICE 52 vs 65.
6. **Precompute offline; no runtime third-party API calls** (Open-Meteo/Overpass throttling and silent fallbacks). Ship pre-tiled data with LOD.
7. **Treat procedural planets as the same pipeline with synthetic global fields**, so "Earth" and "other planets" share the grid, scale and local synthesizer.

---

## 6. Evidence index (quick lookup)

- Leaflet era code: `terra-server/game/world/{ElevationService,TerrainManager,WaterService}.js`, `game/movement/PathfindingService.js`, `utils/geo/localMap.js`, `routes/building/building_mgmt_routes.js:13-47`, `routes/game_routes.js:373`, `database_init/schema.js:1389-1437`.
- Leaflet era docs: `README.md:167-196`; `docs/GDD/World/Consolidated_World.md:489-690`; `docs/GDD/Map/Consolidated_Map.md:173-281, 659-1006`; `docs/Projects/terra_in_cognita/Game_Design_Document.md:34-56, 111-124, 1414-1442`; `docs/archive/NAS_DEPLOYMENT.md:19-26`; `docs/archive/TF-002_FeatureList.md:299-302, 426, 441-442, 468`; `docs/ARCHITECTURE.md:15, 37, 368-369`; `docs/DATABASE_SCHEMA.md:134-135`; `docs/Engineering/Infrastructure/DB_MIGRATION_POSTGRESQL.md:920-923`; `CLAUDE.md:79, 130-150`.
- Stop/removal: `changelog_archive_2026-04.md:2085-2094` (2026-03-31 OSM removal), `:3401-3409` (2026-03-26 GPS removal), `:3852` (2026-03-23 deprecations); Benchmarking `Consolidated_Analysis.md:483-485`.
- Procedural world: `terra-client/src/components/WorldMap/core/{BiomeGenerator,WorldMapService,ChunkManager,types}.ts`, `shared/MiniMap.tsx`; `docs/GDD/Map/Consolidated_Map.md:284-656, 1008-1376`.
- Local map: `terra-client/src/components/SecondaryMap/{SecondaryMapGenerator.ts,types.ts,SecondaryMapRenderer.ts}`; server copies `terra-server/scripts/SecondaryMap/*.js`, `scripts/WorldMap/core/*.js`; `game/gather/ProceduralResourceHelper.js`.
- Performance: `docs/2026-10-26_테스트서버_오프라인_서버분리_PixiMap_로딩지연_분석보고서.md:95-280`; `docs/changelog.md:1-30`; commit `0ea5299`.
- Scale contradictions: `piximap_routes.js:1520-1521`, `TerritoryEngine.js:89-90`, `NpcTileUtils.js:72-75`, `NpcManager.js:399-400`, `Consolidated_Map.md:1369-1374`, `BLD-1_BuildingGated_Navigation.md:661-704`, `Game_Design_Document.md:1422-1423`.
- Prototype: `/home/user/terra-in-cognita` commits `a8271ad`, `5a10433`; `server/terrain-generator.js`, `server/worldmap/worldmapController.js:273-349, 552-605`, `client/src/components/map/SvgMapRenderer.js:26-62`, `docs/map generator`.
- Earth images: `terra-client/public/earth_v3_final.png`, `earth_v5_hyper.png`, `earth_v8_flat_tactical.png` (JPEG 1024², unreferenced; present at `c236501`).
