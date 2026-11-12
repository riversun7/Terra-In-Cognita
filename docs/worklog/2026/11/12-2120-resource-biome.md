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
| `docs/questions/2026-11-12-resource-biome.md` | 질문 1211~1215 |

## 함께 바꿔야 하는 파일
- 바이옴 ID를 더하거나 바꾸면 `packages/shared/src/catchment.ts` `RESOURCE_BIOME_GROUPS`(표 밖은 "other" 배율).
- 몫에 드는 설정 칸을 더하면 `apps/server/src/planet/resourceMap.ts` `resourceRulesKey`.
- 행성 면 축(`packages/planet/src/faces.ts` `FACE_FRAMES`)을 바꾸면 `catchment.ts` `CUBE_FRAMES`(시험이 잡는다).

## 건드리지 말 것
- `catchment.ts`의 광석·높은 티어 부분(같은 때 `ore-3` 줄기가 고친다).
- `apps/server/src/facilities/npcSeed.ts`의 약초원·목장 땅 조건(같은 때 `npc-build-2` 줄기 — 질문 1213).

## 미검증·TODO·알려진 문제
- 시작 도시 자리가 바뀐다(37/49곳). 새 자리는 세계 새로 시작 뒤에만 든다(이 묶음 합친 뒤 NAS 새로 시작 예정).
- 2차맵 목초지 밭 개수 변화는 재지 않았다(Unknown) — 목초지 바이옴 2차맵에만 선다(Verified: 시험 비트 판정).
- 1차맵 자원 레이어 그림은 눈으로 보지 않았다(`planet-view` 화면 시험 결과는 아래 검사 줄).
- NPC 씨앗 약초원·목장 땅 조건은 옛 규칙(질문 1213).

## 검사
- (끝에 채운다)

## 사용자 결정 대기
- 질문 1211~1215(모두 추천안을 [임시]로 넣음, 1213은 그대로 둠).
