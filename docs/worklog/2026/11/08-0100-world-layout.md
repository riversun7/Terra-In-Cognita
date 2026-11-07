# 세계 배치(사용자 지적 4): 고정 국가마다 행성 위 자기 자리, 다른 세력 범위에 도시를 세우지 않음, 옛 세계 옮기기

- 일시: 2026-11-08 01:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-world-layout.md`(상태 제안), 질문 `docs/questions/2026-11-07-world-layout.md` 640~649(새, 확인 대기), ADR `2026-11-07-play-flow.md` WP1·WP2·WP5·WP9, 기획 D-104·D-485·D-486·D-340·D-341·D-6041·질문 500 답(D-518), 가지 `work/world-layout`(시작점 main `51c59a9`)

## 한 일
- **원인 확인**(Verified: 코드): 세계 씨앗(WP1 `planStartCities`)이 국가 넷의 시작 도시를 시험 2차맵 한 줄(면 0 (282~287, 328), 1차맵에서 약 9km 띠)에 국가마다 서로 다른 2차맵으로 흩어 섞었다 → 영향권이 다른 국가와 겹치고, 같은 국가 도시가 비콘 거리 안이라 껍질이 띠 전체에 걸쳐 국가마다 겹쳤다. NPC 마을 자리는 다른 세력 영향권을 보지 않았고, 새 가문(독립)은 "아무 도시 중 첫 것" 둘레에 섰다.
- **세계 배치**(`apps/server/src/world/worldLayout.ts`, 순수): 행성을 면마다 64 × 64칸으로 본 알맞은 땅(물 없음·고도 0~1500m·기온 8~32°C·강수 300mm 이상 [임시])에서 국가 수도를 가장 먼 점 고르기로(첫 수도 = 세계 행성 ID 해시로 고른 칸, 둘레 48칸, 국가 사이 30칸보다 가까우면 반경 두 배씩, 시험 줄 둘레 30칸 제외). 시작 도시 = 수도 2차맵 가운데 + 수도와 붙은 2차맵 가운데(변 이웃 먼저, 2차맵마다 하나, 다른 세력 영향권 밖). 실제 시험 행성 값으로 국가 넷 = 열대우림·온대림·사바나, 국가 사이 38칸 넘게, 210ms(16국은 반경 192칸·간격 44칸·242ms, Verified: 캐시된 `.values`로 임시 스크립트, 커밋하지 않음). 땅 조건 없이 돌리면 넷 다 사막이었다(강수·기온 조건을 더한 까닭).
- **부팅**(`world/worldBoot.ts`): 옛 자리 계획·옮기기 → 고정 국가·모자란 시작 도시(자리 함수 `StartCityPlacer`를 `ensureTestNations`에 넘김 — 수·이름·기본 시설은 WP1·WP5 그대로) → 띄울 2차맵 = 시험 줄 + 도시·폐허 2차맵(상한 64). 부팅이 지형 서비스 준비를 먼저 기다린다. 봇은 띄운 2차맵 모두에 나눈다(도시 2차맵의 봇은 NPC 휴먼). 행성 값이 없는 세계·NPC 사회를 끈 세계는 옛 방식.
- **도시 세우기 금지 한 규칙**: `@terra/shared/territory foundingConflict`(같은 편이 아닌 도시의 영향권 + 새 도시 영향권 안이면 막음). 세계 배치와 NPC 마을 자리(`npc/townSites.ts pickTownSite`, `npc/persist.ts`가 씀)가 같은 함수. 시뮬 `society.found`에 자리 검사 고리 `canFound`(서버만 넘김 — 자리를 고르고 다음 도시 ID에 잡아 둠, 시뮬 출력 그대로).
- **1차맵 영토**(`apps/game/src/map/CityOverlay.tsx`·`cityOverlay.css`): 국가마다 영향권 원들을 한 경로로 — 겹친 곳 한 번 칠, 바깥 둘레만 테두리(원 안쪽을 지우는 밝기 가리개). 영토 개발 화면 지도 가운데 = 고른 세력 첫 도시(`editor/territory/territoryModel.ts labCenter`).
- **옛 세계**(`world/relayout.ts`, `WORLD_RELAYOUT`, 기본 0 = 계획만 기록, NAS `ops/compose.yml` 1): 시험 줄의 고정 국가 시작 도시 가운데 막는 것(전투·플레이어 건물·시설 계약·플레이어 작업·수호신·영토 비콘·그 2차맵의 플레이어 유닛·일하는 사이보그·NPC 휴먼 계약·NPC 건물 창고 물건)이 없는 도시만 옮긴다: 도시 줄(ID 그대로)·NPC 시설 지우고 새 자리에 다시·감사 기록 `world.relayout_city`, 복구 직전에 그 도시 NPC 휴먼과 쉬는 사이보그 본체를 새 도시 둘레로(유닛 ID 그대로).
- **나눔**: 시험 2차맵 자리를 `world/testMaps.ts`로(world.ts가 다시 내보냄), 세계 씨앗 부팅을 `world/worldBoot.ts`로. `world.ts` 982 → 978줄.
- **설정 칸**(팩 core@51): `world_layout_region_cells` 48·`_nation_gap_cells` 30·`_city_step_cells` 1·`_land_max_height_m` 1500·`_land_min_temp_c` 8·`_land_max_temp_c` 32·`_land_min_rain_mm` 300.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/worldLayout.ts`(새)·`worldLayout.test.ts`(새) | 국가 수도·시작 도시 자리(순수), 시험(가짜 행성 값) |
| `apps/server/src/world/worldBoot.ts`(새) | 세계 씨앗 부팅(배치·옛 자리·띄울 2차맵) |
| `apps/server/src/world/relayout.ts`(새) | 옛 자리 시작 도시 옮기기(계획·적용·유닛) |
| `apps/server/src/world/testMaps.ts`(새)·`world.ts` | 시험 2차맵 자리 나눔, 부팅 잇기·도시 2차맵 띄우기·봇 나누기·유닛 옮기기 |
| `apps/server/src/world/worldLayout.db.test.ts`(새) | 새 세계·옛 세계(계획만/옮김) DB 시험 |
| `apps/server/src/npc/nations.ts` | 자리 함수(`StartCityPlacer`)를 받음, 발전도 읽기 |
| `apps/server/src/npc/townSites.ts`(새)·`townSites.test.ts`(새)·`persist.ts`·`runtime.ts` | NPC 마을 자리 = 다른 세력 영향권 밖, 시뮬 자리 검사 고리 잇기 |
| `apps/server/src/config.ts`·`main.ts` | `WORLD_RELAYOUT` |
| `packages/shared/src/territory.ts`·`territory.test.ts` | `foundingConflict` |
| `packages/sim/src/simulator/society.ts`·`societyTypes.ts` | `canFound` 고리(넘기지 않으면 그대로) |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 일곱, 팩 core@51 |
| `apps/game/src/map/CityOverlay.tsx`·`cityOverlay.css` | 국가 영토 = 원들의 합 하나 |
| `apps/game/src/editor/territory/territoryModel.ts`·`territoryModel.test.ts`·`TerritoryLabScreen.tsx` | 지도 가운데 = 고른 세력 첫 도시 |
| `e2e/territory.spec.ts` | 세력을 먼저 고르고 칸을 누름, 껍질 수를 비콘 없을 때와 견줌, 개수 상한 = 도시 둘 × 3 |
| `ops/compose.yml`, `AGENTS.md` | NAS `WORLD_RELAYOUT: "1"`·설명, 명령 표 설명 |
| `docs/adr/2026-11-07-world-layout.md`(새), `docs/questions/2026-11-07-world-layout.md`(새), `docs/PLAN.md` | 결정·확인 대기·14장 줄 |

## 검사·시험 (개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- (끝에 채움)

## 함께 바꿔야 하는 파일
- 설정 칸을 더하면 `packages/sim/src/society/worldSeed.ts`(칸)·`tuningWorldSeed.ts`(키)·`content/core/tuning.json`(값·범위)·`manifest.json`(판)을 함께.
- 도시를 새로 만드는 길(플레이어 도시 세우기 등)을 더하면 `@terra/shared foundingConflict`를 거친다(ADR 결정 4).
- 옛 자리 옮기기의 막는 표(`relayout.ts inspectLegacyCity`)는 도시·건물을 가리키는 새 표가 생기면 넣는다.

## 건드리지 말 것
- 2차맵 사이 이동(`apps/server/src/travel/`)·경제(`market/`·`npc/economy.ts`)는 다른 줄기(`work/play-move2`·`work/play-econ4`) 몫이라 손대지 않았다.
- 시험 2차맵 줄(`S1_TEST_MAP_KEY`)은 서버·화면 시험·규모 시험 자리 — 지우지 않는다.

## 미검증·TODO·알려진 문제
- 국가 사이는 띄우지 않은 2차맵이 끼어 2차맵 사이 이동이 `no_route`다(`work/play-move2`가 들어오면 열린다). 한 국가 안은 붙은 2차맵이라 지금도 걸어서 오간다.
- 옛 세계 옮기기에서 도시 줄을 커밋한 뒤 유닛을 새 자리로 쓰기 전에 서버가 죽으면, 쉬던 사이보그가 옛 2차맵에 남는다(시작 도시는 새 자리, 부팅 다시 시도는 계획을 남겨 옮긴다). 드문 틈이라 따로 고치지 않았다.
- 옛 세계를 옮기면 시험 줄의 봇이 줄어 다음 부팅에 시험 줄에 봇이 조금 더 생긴다(2차맵마다 몫 = 1,000 ÷ 띄운 2차맵 수, 이미 있으면 더하지 않음).
- 옮긴 도시의 플레이어에게 알림(우편)은 보내지 않는다(감사 기록·서버 기록만).
- 실제 NAS DB에서 돌려 보지 않았다(미실행). NAS에서는 플레이한 도시(플레이어 건물·일꾼·계약)가 남아 국가가 둘로 나뉠 수 있다.

## 사용자 결정 대기
- 질문 645: NAS 시험 세계를 새로 시작할지(가장 깨끗함) — 그 전엔 `WORLD_RELAYOUT=1`로 안전한 도시만 옮긴다.
- 질문 640~649 나머지(기획 세션).
