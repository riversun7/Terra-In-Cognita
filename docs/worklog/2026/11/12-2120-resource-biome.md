# 목재·약초·목장 바이옴 나눔과 노이즈, 사막 전략 자원 자리 (D-536)

- 일시: 2026-11-12 21:20 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-536, ADR `docs/adr/2026-11-11-city-catchment.md` "바뀜 (2026-11-12): 목재·약초·목장 바이옴 나눔과 노이즈, 사막 전략 자원 자리", 질문 `docs/questions/2026-11-12-resource-biome.md`(1211~1215), 가지 `work/resource-biome`

## 한 일
- 사용자 원문 "목재와 약초 목장 분포가 너무 겹친다, 또한 자원이 없는 사막에는 추후 석유같은 전략 자원을 배치할수도"(D-536 1부·2부).
- 공용 칸 몫 함수(`@terra/shared/catchment`)에서 목재·약초·목장을 바이옴 무리 배율 × 자원마다 다른 시드 노이즈로 셈한다. 서버 NPC 경제(채집 다툼)·시작 도시 자리 점수·1차맵 자원 레이어가 모두 같은 함수(`cellSharesPm`)를 쓴다.
  - 목재 = 숲 밀도 몫 × (숲 1000 / 그 밖 300‰), 약초 = 습지 1000·고산 초지 800·숲 가장자리·빈터 450·그 밖 100‰, 목장 = 초지·사바나·툰드라 1000·그 밖 0‰. 물·빙상 0.
  - 노이즈 = 정육면체 위 정수 값 노이즈(격자 8칸, 면 경계에서 이어짐). 배율 250~1750‰(가운데 1000 — 바이옴 평균 몫은 거의 그대로).
  - 숲 약초는 목재 노이즈 반대(빈터)를 80% 따른다.
  - 약초·축산물 있음 비트 = 몫 ≥ 150‰. 목재·작물 비트는 그대로.
- 사막 = 전략 자원 자리: `STRATEGIC_SLOT_BIT`(64, 여섯 원자재 비트 밖)·`isStrategicSlot`. 아무것도 나지 않는다(자리만).
- 설정 칸 15개 `resource_*`(팩 core@77), 세계 씨앗 계수표·설정 칸 표에 더함. 1차맵 자원 레이어 규칙 열쇠에도 더함.
- 측정 스크립트 `apps/server/bench/resourceOverlap.ts`(새로): 땅 칸 상관·위 20% 겹침·함께 500‰ 칸·바이옴 평균 몫·시작 도시 배후지 땅 몫.
- 측정(Verified, S2 시험 행성 F9, 전 / 뒤): 위 20% 칸 겹침(자카드) 목재·약초 0.263 / 0.041, 목재·목장 0.318 / 0.000, 약초·목장 0.616 / 0.000. 칸 상관 r 0.678 / 0.552(숲 칸만 −0.849), 0.343 / −0.449, 0.641 / −0.407. 함께 500‰ 이상 땅 칸 29.0 / 3.2%, 14.2 / 0.0%, 34.8 / 0.0%. 시작 도시 배후지 평균 목재 717 / 686, 약초 1000 / 349, 목장 1000 / 188(중앙 0). `citySpacing.ts`: 시작 도시 49곳 가운데 같은 칸 12곳, 하루 목재 −4%, 성장 멈춤 0 / 1곳.

### 더한 일: 기본 건축 재료 바닥(사용자 결정 2026-11-12)
- 사용자 원문 "건축시 목재와 석재는 필수이다 일반 땅에서도 기본 건축에 필요한 광물은 채집가능해야함", 고른 안 "기본 재료 바닥 보장"(조정 세션이 전함).
- 목재 바닥 `resource_wood_baseline_pm` 300‰(마른 땅 어디나, 물·빙상 0) — 공용 `woodSharePm`, 시뮬 평면 `woodBaselinePm`. 목재 있음 비트 = 목재 몫 %(평원에도 NPC 벌목장).
- 석재 바닥: 광석 고도 몫 해수면 150 → 350·언덕 400 → 550‰. 팩 `gather_tiers` 0~59 띠 T1 350‰(T0 500). 시뮬 `TEST_GATHER_BANDS` 같은 값, `SIM_VERSION` 30.
- 플레이어: 노두 자리 종류에 `share`(광석 몫·목재 몫) 칸, 관목 땔감 `brushwood`(소나무 원목, 벌목장, 그림 `log`). 서버 채집·NPC 도시 건물 배치 땅이 목재 몫을 넘긴다.
- 측정(Verified, `resourceOverlap.ts` "기본 건축 재료" 표, 전 / 뒤): 평원 칸 하루 석재 중앙 4.8 / 19.3, 통나무 11.2(어림 바닥 — 실제는 벌목장 없음) / 21.4, 창고 + 숙소 Lv1 날 중앙 3.3 / 1.3. 사막 통나무 0 / 21.6. 시작 도시 석재 5.5 / 20.2, 통나무 85.9 / 56.1(띠 T0 감소, 질문 1217), 날 2.9 / 0.8. 낮은 땅 석재 ÷ 산지 20% / 39%. 관목·돌 노두(모두 풀인 2차맵 20장): 광석 150·목재 0 → 돌 5.0·관목 0, 광석 350·목재 300 → 돌 10.7·관목 15.4. `citySpacing.ts`: 광산 빠르기 평균 225 / 401‰, 하루 목재 합 47,686 / 51,862.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/catchment.ts` | 바이옴 무리 표·노이즈·`woodSharePm`·`herbSharePm`·`livestockSharePm`·전략 자원 자리, `cellMaterials`·`cellSharesPm`이 그것을 쓴다. `CatchmentLand`에 바이옴·칸 자리(선택), `CatchmentThresholds`가 `ResourceBiomeRules`를 잇는다(광석 부분은 그대로) |
| `packages/shared/src/catchment.test.ts` | 새 규칙 시험(무리·몫·노이즈 범위·부드러움·면 경계·시드 상관·배율·빈터·전략 자리), 바뀐 비트·몫 값 |
| `packages/sim/src/society/worldSeed.ts`, `packages/sim/src/tuningWorldSeed.ts`, `content/core/tuning.json`, `content/core/manifest.json` | 설정 칸 15개(출발값 [임시]), 팩 core@77 |
| `packages/planet/src/secondMap/presets.ts`(+시험) | `PlanetCellValues.faceLevel`(선택) — 서버 칸 값이 노이즈 자리를 갖게 |
| `packages/planet/src/secondMap/layout.test.ts` | `cellCubePoint`가 행성 격자 `cubePoint`와 같은 점인지 |
| `apps/server/src/planet/resourceMap.ts`(+시험) | 읽개 칸에 면·i·j를 붙임, 규칙 열쇠에 새 칸. 시험은 약초·축산물 판도 서버 경제와 같은지 |
| `apps/server/src/world/citySites.test.ts` | 초지 목재 배율 300‰로 덮임 값 바뀜 |
| `apps/server/bench/resourceOverlap.ts`, `apps/server/tsconfig.json`, `apps/server/bench/tsconfig.json` | 겹침 측정 스크립트(서버 tsconfig로 검사) |
| `apps/game/messages/{ko,en}.json` | 세계 배치 덮개 범례: 숲(목재)·농사지을 땅(작물) — 약초·축산물은 이제 그 비트를 따르지 않는다 |
| `docs/adr/2026-11-11-city-catchment.md` | "바뀜" 절 |
| `docs/questions/2026-11-12-resource-biome.md` | 질문 1211~1219 |
| `content/core/gather_tiers.json`, `packages/sim/src/economy/gather.ts`(+시험), `packages/sim/src/version.ts` | 낮은 띠 T1 350‰, `SIM_VERSION` 30 |
| `packages/sim/src/simulator/catchmentRun.ts`(+시험) | 평면 목재 바닥, 광석 몫 값 시험 |
| `packages/content/src/schema/gatherObjects.ts`, `content/core/gather_objects.json` | 노두 `share` 칸, 관목 땔감 |
| `apps/server/src/gather/{kinds,objects,world,service}.ts`(+시험), `apps/server/src/facilities/cityLayoutGround.ts` | 목재 몫 노두 자리 |
| `apps/server/src/facilities/npcSeed.test.ts`, `apps/server/src/itemEdit/previewGather.test.ts` | 목재 바닥·띠 값으로 바뀐 기대값 |

## 함께 바꿔야 하는 파일
- 바이옴 ID를 더하거나 바꾸면 `packages/shared/src/catchment.ts` `RESOURCE_BIOME_GROUPS`(표 밖은 "other" 배율).
- 몫에 드는 설정 칸을 더하면 `apps/server/src/planet/resourceMap.ts` `resourceRulesKey`.
- 행성 면 축(`packages/planet/src/faces.ts` `FACE_FRAMES`)을 바꾸면 `catchment.ts` `CUBE_FRAMES`(시험이 잡는다).

## 건드리지 말 것
- `catchment.ts`의 광석·높은 티어 부분(같은 때 `ore-3` 줄기가 고친다).
- `apps/server/src/facilities/npcSeed.ts`의 약초원·목장 땅 조건(같은 때 `npc-build-2` 줄기 — 질문 1213).
- 높은 티어 광석 규칙(`ore_high_min_m`·`ore_flat_high_pm`·`oreTierCapOf` — `ore-3` 줄기, 통합 가지에 있음). 이 가지는 `ore_share_low_pm`·`ore_share_hill_pm` 값만 바꿨다.

## 미검증·TODO·알려진 문제
- 시작 도시 자리가 바뀐다(37/49곳). 새 자리는 세계 새로 시작 뒤에만 든다(이 묶음 합친 뒤 NAS 새로 시작 예정).
- 2차맵 목초지 밭 개수 변화는 재지 않았다(Unknown) — 목초지 바이옴 2차맵에만 선다(Verified: 시험 비트 판정).
- 1차맵 자원 레이어 그림은 눈으로 보지 않았다(`planet-view` 화면 시험 결과는 아래 검사 줄).
- NPC 씨앗 약초원·목장 땅 조건은 옛 규칙(질문 1213).
- 창고 + 숙소 날 수는 어림 모형이다(Assumed: 다툼 없음, 일꾼 스탯 10·10, 하루 12시간, 짓기 시간·운반 제외). 시뮬 전체 경제로 재지 않았다.
- 관목 땔감·돌 노두 수는 지표가 모두 풀인 가짜 2차맵으로 쟀다(실제 시작 도시 2차맵은 Unknown).

## 검사
- Verified: `pnpm check`(TEST_DATABASE_URL 있음) — 파일 658개 가운데 657 통과, 시험 5,025개 가운데 5,024 통과. 실패 1 = `apps/server/src/world/nationTiers.db.test.ts`(풀밭 도시에 목재 바닥 벌목장이 더 선다 — 기대값을 등급 벌목장 수로 고침), 고친 뒤 그 파일만 다시 돌려 4/4 통과.
- Verified: `pnpm build` + `node scripts/check-pwa.mjs` + `pnpm check:bundle` 통과(build-exit 0, `apps/game`은 범례 문구만 바뀜).
- Verified: `pnpm e2e e2e/world-layout.spec.ts e2e/planet-view.spec.ts` 26 통과(5.3분). 자원 지도 화면 시험에 약초·목장을 더했다: 평균 픽셀 차이 광석→목재 38.22, 목재→약초 33.59, 약초→목장 25.78(문턱 0.5).
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/resource-biome-shots/planet-resource-{wood,herb,livestock}.png`, `planet-layer-resource-390-{pastel,dark}.png`.

## 사용자 결정 대기
- 질문 1211~1219(모두 추천안을 [임시]로 넣음, 1213·1217 나는 넣지 않음).

## 통합 가지 합치기 (2026-11-13 01:00 KST 무렵, Claude Code)
- `origin/merge/integration` `0fe66a0`(ore-3·condition-2·terrain-objects·npc-build-2·operator-speed)을 이 가지에 합쳤다. 충돌 17파일.
- `packages/shared/src/catchment.ts`: ore-3 높은 티어(`oreHighMinM`·`highOrePm`·`oreTierCapOf`, 광석 비트 = 고도 ≥ `oreHighMinM`)와 이 가지의 바이옴 몫·목재 바닥·전략 자리를 함께 둠. 시험은 두 쪽 모두(ore-3 비트 시험은 빙상 칸으로 — 초지는 목재 바닥·축산물 비트가 붙는다).
- `resourceRulesKey`: `ore_high_min_m`·`ore_flat_high_pm` + `resource_*` 15칸. `worldSeed`·`tuningWorldSeed`·`tuning.json`은 칸 합집합(`ore_share_hill_pm`은 값 550·설명은 통합 쪽).
- `gather_objects`: 통합 차례(노두 → site·school) 뒤 맨 끝에 `brushwood` — 앞 종류 번호 그대로. 노두 `share` 칸·`kinds.ts` `share`와 site·school 칸 함께. `gather/service.ts`·`world.ts`는 `woodSharePm`·`terrainKind` 둘 다 넘김. 관목은 노두 단계에서 놓여 그 뒤 site 자리가 가끔 옆 칸으로 밀릴 수 있다(Assumed — 세계 새로 시작 예정이라 그대로 둠).
- `catchmentRun.test.ts` 높은 티어 몫 = (1000 × 1000 + 350 × 50) ÷ 1350 = 753(두 바뀜이 함께 든 값).
- 판: 팩 core@78, `SIM_VERSION` 32(30 npc-build-2, 31 ore-3, 32 이 가지). ADR은 두 "바뀜" 절을 모두 둠, `docs/WORKLOG.md`는 `pnpm docs:index`로 다시 만듦.
- 통합 가지에 이미 있던 검사 실패 셋을 함께 고침: `packages/engine/src/props/schoolView.test.ts` 이름 목록 `as const`(타입), `apps/server/src/gather/gateway.test.ts` 가짜 서비스에 `objectsAt`(operator-speed × terrain-objects), `apps/server/src/world/world.ts` 1,001줄 → 1,000줄(주석 두 줄을 한 줄로).
- Verified: `pnpm check`(TEST_DATABASE_URL) 시험 파일 667/667·시험 5,085/5,085 통과, `pnpm check:content` 통과(core@78), `pnpm check:docs` 통과, `pnpm build`·`check-pwa`·`check:bundle` 통과. 화면 시험은 아래 줄.
- Verified: `pnpm e2e` world-layout·planet-view·gather-station·terrain-objects·operator-speed 45 통과·1 건너뜀(측정 시험, `E2E_MEASURE` 없음), 13.3분.
