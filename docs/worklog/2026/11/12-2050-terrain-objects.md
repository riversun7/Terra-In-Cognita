# 지형별 2차맵 오브젝트 — 지형마다 5종 이상, 연안 걸어서, 대륙붕·심해 움직이는 어군(D-536 3·4)

- 일시: 2026-11-12 20:50 ~ (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/terrain-objects`(main `0864282` 미러 D-536에서), 기획 D-536(42 §5 표), ADR `2026-11-07-gather-objects.md` "바뀜 (2026-11-12): 지형별 오브젝트·움직이는 어군", ADR `2026-10-31-second-map-from-planet.md` "바뀜 (2026-11-12, 물 위 소품·지형별 장식)", 질문 `docs/questions/2026-11-12-terrain-objects.md`(1221~1231)

## 한 일
1. **나눔**(사용자 지시: 자원이 나오면 채집 오브젝트, 장식이면 소품): 장식은 생성기 소품(팩 `map_props`), 자원이 나오는 것은 서버 채집 오브젝트(팩 `gather_objects`) — 노두(ore-2)처럼 서버가 놓고 기기가 그림을 덮어 세운다.
2. **물 위 소품**: `map_props` 흩기 항목에 `water`(엄폐 0만) — 생성기가 물 칸에만 놓는다. 생성기 코드는 물 위 소품이 없는 규칙에서 출력이 같다(아래 Verified). 팩 core@77에 장식 28항목(빙상 눈더미·빙하 균열(차폐)·화석, 툰드라 동토 웅덩이, 타이가 베리 덤불, 사막 모래언덕·소금 평원·석유 스밈, 사바나 물웅덩이, 열대 덩굴·과일나무, 습지 늪 웅덩이·이탄, 고산 절벽 바위(차폐)·동굴 입구, 연안 모래사장 둔덕·조개 밭·소금밭·진흙밭, 물 위 얕은 여울·해초 숲·산호초·해저 광맥·빙산·해류·해저 석유·연잎·작은 섬).
3. **지형별 채집 자리**(`gather_objects` source `site`): 바이옴 천분율·지표·물가(`shore`)·바닷가(`coast`) 조건, 노두 뒤에 16×16 묶음마다(앞 종류 번호·자리 그대로). 23종 — 연안(걸어서): 갯바위(석재)·표류목(목재), 호숫가 물가 바위, 땅 지형마다 약초·광맥·나무·곡물 등, 바다(배로만): 난파선·열수구.
4. **움직이는 어군**(`gather_objects` source `school`): 서버가 물 칸 위 닫힌 길을 결정적으로 정하고 자리는 시각만의 함수(`@terra/shared/fishSchool`, 정수). 민물·연안 어군은 물가 6칸 안에서 낚고(유닛이 쫓아가 낚는다, 멀어지면 다시 쫓음), 대륙붕·큰 어군·고래 무리는 배로만. 낚시터 채집소는 정산 시각의 어군 자리로 반경을 본다. 조회 `gather.objects`에 `schools`·종류 `boat`.
5. **배**: 지금 배·물 이동이 없음을 확인(유닛 종류 다섯 모두 걷기, 물 관련은 낚시터 `needsWaterWithin`뿐). 반쯤 만들지 않고 질문 1221에 계획(B1 배 유닛·물 길찾기·부두 → B2 바다 건너기 → B3 배 채집·해류)을 적었다. 배로만 닿는 오브젝트 판은 안내를 보이고 [채집]을 숨긴다(서버도 `unavailable`).
6. **엔진**: 겉모습 `kit` 모델 50종(`props/propKits.ts`, 부품 여섯 그대로), 물 위 소품은 수면 높이(`sampleSurfaceM`), 어군은 `SchoolView`(InstancedMesh 하나, 프레임마다 같은 함수로 자리, 가까이에서만). `setSchools` API.
7. **개발자 페이지(D-398)**: 새 화면 `/dev/terrain-objects`(지형 오브젝트 편집기) — 지형 14개 칩(5종 아래 경고), 지형마다 소품·채집 자리·어군의 양 고치기·더하기·빼기, 바뀐 항목만 `terra-tuning-diff` 내보내기 → `pnpm tuning:apply`(분류 `map_props`·`gather_objects`를 차이 분류·적용 스크립트에 더함). 바로 적용은 두지 않았다(소품 규칙 = 지형 캐시 열쇠).
8. **측정 스크립트** `pnpm --filter @terra/server bench:terrain-objects [면 레벨] [지형마다 2차맵 수]`.

## 생성기 판·지형 캐시 (사용자 지시 "꼭 필요할 때만, 올리면 까닭을")
- `SECOND_MAP_GENERATOR_VERSION`(1)·행성 생성기 판(3)은 올리지 않았다. 생성기 코드 변경은 물 위 소품 항목이 있을 때만 출력을 바꾼다: 앞 규칙(팩 18항목)으로 시험 행성 다섯 자리의 골든 해시가 앞과 같고(desert a918e17e 등), 새 규칙에서도 다섯 자리 엄폐 층·앞 그림 칸이 같다(Verified: 임시 시험, 저장소에 남기지 않음).
- 지형 캐시는 **팩 소품 규칙이 바뀐 만큼** 다음 시작 때 새로 만든다: 규칙 해시가 지형 주소 판 표지(ADR 46 6절)에 들어 있어 자동이다. 지시가 말한 "재사용할 체계" 자체가 `map_props`라 장식을 넣으려면 규칙이 바뀌어야 한다(2026-11-11 장식 소품 줄기와 같은 길). 채집 오브젝트는 서버가 놓아(생성기 밖) 지형 캐시와 상관없다.
- 골든 해시는 팩 사본(`testMapProps.ts`)을 고쳐 다시 적었다(desert d818ec09, river 0f227059, lake cff29995, ocean e69e35a6, coast 22ddfbb0).

## 측정 (Verified: 실행)
### 지형마다 오브젝트 종류 (`bench:terrain-objects`, S2 시험 행성 F9, 지형마다 서로 떨어진 2차맵 4장)
종류 = 2차맵 하나에 실제로 놓인 소품 그림 종류 + 채집 오브젝트 종류.

| 지형 | 최소 | 평균 | 소품 칸 평균 | 채집 오브젝트 평균 | 어군 평균 | 2차맵 생성 + 자리 ms |
|---|---|---|---|---|---|---|
| 심해 | 7 | 7.0 | 886 | 270 | 8 | 92 |
| 대륙붕 | 7 | 9.8 | 3,382 | 283 | 8 | 91 |
| 연안 | 6 | 15.8 | 2,736 | 267 | 8 | 70 |
| 호수 | 5 | 8.0 | 2,737 | 262 | 5 | 66 |
| 빙상 | 7 | 7.5 | 8,226 | 33 | 0 | 53 |
| 고산 | 13 | 17.3 | 8,193 | 524 | 0 | 73 |
| 습지 | 14 | 19.8 | 23,713 | 1,106 | 0.3 | 73 |
| 툰드라 | 18 | 23.0 | 7,714 | 718 | 0 | 104 |
| 타이가 | 15 | 15.0 | 24,593 | 1,025 | 0 | 41 |
| 온대림 | 19 | 22.0 | 30,308 | 1,260 | 0 | 50 |
| 초지 | 14 | 17.3 | 18,746 | 1,120 | 0 | 47 |
| 사막 | 17 | 17.0 | 12,475 | 184 | 0 | 50 |
| 사바나 | 21 | 22.0 | 21,894 | 1,253 | 0 | 58 |
| 열대우림 | 20 | 24.8 | 38,494 | 1,312 | 0 | 55 |

- 예: 심해 = 해류·해저 석유·빙산(장식) + 물터·열수구·큰 어군·고래 무리·난파선, 빙상 = 빙하 균열·얼음덩이·화석·눈더미·돌무더기·큰 바위 + 운석 조각·극지 약초, 사막 = 선인장·모래언덕·소금 평원·석유 스밈·물웅덩이 … + 사암 바위·약용 선인장·오아시스·노두.
- 첫 측정에서 호수 한 곳이 4종이라(찬 호수 — 연잎 기온 곡선 밖) 연잎 기온 하한을 낮추고 작은 섬을 늘리고 빙산을 찬 호수에도 두었다 → 5종.
- 개발자 편집기 기준(이 화면이 고치는 종류만): 지형마다 6~21종(시험 `terrainObjectsModel.test.ts`가 14 지형 모두 5 이상을 본다).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/mapProps.ts`(+시험) | 그림 이름표 50개를 끝에 더함(21번부터) |
| `packages/content/src/schema/mapProps.ts`, `gatherObjects.ts` | `water` 칸, source `site`·`school` |
| `packages/planet/src/secondMap/props.ts`, `placement.ts`, `testMapProps.ts`, `testMapPropsTerrain.ts`(새 — 1,000줄 상한으로 나눔), `generate.test.ts` | 물 위 소품(규칙 해시 표지), 팩 사본·골든 해시 |
| `content/core/map_props.json`, `gather_objects.json`, `manifest.json` | 장식 28·채집 자리 23·어군 5, core@77 |
| `packages/shared/src/fishSchool.ts`(+시험), `package.json` | 어군 자리 함수(서버·기기 공용) |
| `apps/server/src/gather/terrainObjects.ts`(+시험), `objectHash.ts`, `objects.ts`, `kinds.ts`(+시험), `service.ts`, `world.ts`, `reads.ts`, `packages/shared/src/gather.ts` | 지형별 자리·어군 자리, 낚는 거리·배 조건, 정산 시각 자리, 조회 칸 |
| `apps/server/src/world/mapProps.ts` | `water` 넘김 |
| `apps/server/src/content.ts`, `planetEditor/definitions.ts`, `types.ts` | 정의 조회에 `gatherObjects` 원본 항목 |
| `apps/server/bench/terrainObjects.ts`, `apps/server/package.json` | 측정 스크립트 |
| `packages/engine/src/props/propKits.ts`(새), `propLook.ts`, `propParts.ts`, `propView.ts`, `schoolView.ts`(새, +시험), `terrain/terrainData.ts`, `secondMapEngine.ts`, `engineTypes.ts`, `engineParts.ts`, `index.ts` | 모델·수면 높이·어군 인스턴스·`setSchools` |
| `packages/protocol/src/version.ts`, `gather.ts`(+시험) | 프로토콜 26(최소 25): 어군 번호(65,536부터)를 `gather_start`가 받게 objectId 상한 넓힘 |
| `apps/game/src/map/gather/gatherState.ts`, `gatherOverlay.ts`, `objectProps.ts`(+시험), `GatherPanel.tsx` | 어군 길 풀기·움직이는 표시·엔진 어군·배 안내 |
| `apps/game/src/editor/terrainObjects/*`(새), `shell/routeViews.tsx`, `scope/scopeRoutes.ts`, `sections/ComingSoon.tsx`, `editor/DevHome.tsx`, `packages/shared/src/routes.ts`(+시험), `vite.config.ts`, `scripts/pwa-build.mjs` | 개발자 지형 오브젝트 편집기(조각 `TerrainObjectsScreen-*`, 미리 캐시 밖) |
| `packages/content/src/tuningDiff.ts`, `scripts/apply-tuning-diff.mjs` | 차이 분류 `map_props`·`gather_objects` |
| `apps/game/src/editor/secondMapLab/labMessages.ts`, `apps/game/messages/{ko,en}.json` | 새 그림 이름·화면 문구 ko·en |
| `e2e/terrain-objects.spec.ts`(새), `e2e/dev.spec.ts` | 사진·측정·편집기, 도구 수 18 |
| ADR 둘 "바뀜", 질문 1221~1231 | 결정 기록·물음 |

## 함께 바꿔야 하는 파일
- 다른 줄기도 팩 판(core@77)·프로토콜(26, 최소 25)을 올리면 통합 때 접는다. `MAP_PROP_ARTS` 끝에 다른 줄기가 그림을 더하면 번호가 겹치지 않게 차례를 맞추고 `labMessages.ts`·엔진 `propLook.ts`도 더한다.
- `map_props`를 바꾸면 `packages/planet/src/secondMap/testMapProps.ts` 사본과 `generate.test.ts` 골든 해시를 함께 고친다(`props.test.ts`가 막는다).
- 새 `site`·`school` 종류는 `gather_objects` 끝에 더한다(앞 종류 차례가 오브젝트 번호·상태 줄에 든다).

## 건드리지 말 것
- 2차맵 생성기 판·행성 생성기 판(위 절).
- 오브젝트 차례: 소품·바위 → 밭·목초지·물터 → 노두 → 지형별 자리 → 어군. 앞으로 옮기면 지금 세계의 상태 줄이 어긋난다.

## 미검증·TODO·알려진 문제
- 배는 없다(질문 1221). 대륙붕·심해 오브젝트는 지금 아무도 캘 수 없다(낚시터 일꾼이 반경 안에 들어온 대륙붕 어군만 — 연안 2차맵).
- NPC 도시 건물 배치는 지형별 오브젝트를 아직 보지 않는다(질문 1230, `npc-build-2` 줄기와 겹쳐 손대지 않음).
- 이웃 2차맵의 물 위 소품은 수면 높이를 몰라 바닥에 선다(물 아래라 안 보임). 이웃 2차맵의 지형별 채집 자리·어군은 그리지 않는다(노두와 같음).
- 휴대폰 실기기에서 보지 않았다(Unknown). 헤드리스 SwiftShader 값은 휴대폰 값이 아니다.
- 아이템이 없는 자원은 장식(질문 1224), 느려짐 판정 없음(질문 1223).

## 검사
- 통합 가지 묶음 검사(2026-11-13, Verified): `pnpm check` 5,098 시험 통과(map-hud 줄기가 같은 트리에서 실행), 빌드·`check-pwa`·`check:bundle`(109,068 B) 통과, 화면 시험 `terrain-objects.spec.ts` 7 통과·1 건너뜀(E2E_MEASURE 측정 전용). 묶음 기록 `docs/worklog/2026/11/13-1840-batch-1112d-merge.md`.

## 사용자 결정 대기
- 질문 1221~1231(`docs/questions/2026-11-12-terrain-objects.md`). 1221(배 범위)이 다음 줄기를 정한다.
