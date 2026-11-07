# 2차맵 원자재 오브젝트 채집·건물·숲 들어가기(사용자 지적 문제 2·3)

- 일시: 2026-11-08 00:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-gather-objects.md`(상태 제안), 질문 `docs/questions/2026-11-07-gather-objects.md`(660~672, 확인 대기), 기획 D-112·D-115·D-5030·D-5032·D-227·D-234·D-507·D-515, 가지 `work/gather-objects`(시작점 main `51c59a9`)

## 한 일
- 사용자 지적 "문제점2. 숲이나 건물로 진입 등의 상호작용 불가"·"문제점3. 2차맵에 바이옴에 따른 원자재 채집 오브젝트 미구현상태"와 채집 답(원문은 ADR 배경)을 넣었다.
- **콘텐츠**(팩 core@51): 새 분류 `gather_objects` 일곱 종류(침엽수·활엽수·야자수·쓰러진 나무 → 원목, 바위 → 석재, 광맥 → 구리 광석, 약초 덤불 → 야생 약초), 설정 칸 `gather_obj_*` 9개(계수표 `gatherObjects`, 모두 [임시]).
- **판정**(`SIM_VERSION` 19): 지형 비용에 소품 그림 층을 주면 나무가 선 차폐 칸을 지표 × 1.8([임시] `FOREST_COST_PM`)로 지나간다. 시야는 그대로 막고 큰 바위는 그대로 막힌다. 서버 지형(생성·캐시·고정본)이 그림 층을 넘긴다.
- **서버**(`apps/server/src/gather/`): 오브젝트 자리(8×8 묶음마다 하나, 결정적), 채집 줄(걷기 → 캐기 → 원장 유닛 화물 → 차면 맡는 시설·창고·도시에 넣기 → 되풀이, 떨어지면 다음 같은 종류), 시설 반경 버프(수확 레벨 보너스·피로 절반·다시 자람 절반), 오염이면 늦게 자람, 건물 들어가기(넣기 → 직무 받기 → 안에 머물기), 오브젝트 상태 표 `gather_object_states`, 프로토콜 17 게이트웨이, tRPC `gather.objects`·`loops`·`building`. `world.ts`를 고치지 않고 앱이 세계 준비 뒤 만든다(`gather/world.ts`).
- **화면**(`apps/game/src/map/gather/`): 오브젝트 표시(누르는 단추, 떨어지면 속 빈 회색 고리)·건물 표시·내 유닛 채집 이름표, 누르면 아래 작은 판(채집·정보·닫기 / 들어가기·안에 있는 유닛), 채집 줄 한 줄 + [멈추기]. 문구 67개(ko·en).
- **판**: 프로토콜 17(최소 16), 팩 core@51, `SIM_VERSION` 19, 마이그레이션 `20261107145944_gather_object_states`(새 표만).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/terrain/layerCosts.ts`·`.test.ts`, `index.ts`(내보내기 묶음을 `export *`로 줄임 991 → 986줄), `version.ts` | 숲 지나가기, `SIM_VERSION` 19 |
| `packages/sim/src/society/gatherObjects.ts`(새)·`coefficients.ts`, `tuningGather.ts`(새)·`tuning.ts` | 채집 계수표·설정 칸 대응 |
| `content/core/gather_objects.json`(새)·`tuning.json`·`manifest.json`, `packages/content/src/schema/gatherObjects.ts`(새)·`categories.ts`·`index.ts` | 오브젝트 종류 분류·설정 칸 9개·core@51 |
| `packages/protocol/src/gather.ts`(새)·`gather.test.ts`(새)·`messages.ts`·`index.ts`·`version.ts`·`travel.test.ts` | 프로토콜 17(최소 16) |
| `packages/shared/src/gather.ts`(새)·`package.json` | 조회 응답 모양(`@terra/shared/gather`) |
| `apps/server/src/gather/*`(새: kinds·objects·rules·state·deposit·enter·service·gateway·reads·world·terrainLayers, 시험 objects·service·gather.db) | 채집·들어가기 서비스 |
| `apps/server/src/db/gatherSchema.ts`(새)·`schema.ts`(다시 내보내기 한 줄, 950줄), `drizzle/20261107145944_gather_object_states/`, `world/persist/tables.ts` | 오브젝트 상태 표 |
| `apps/server/src/world/mapTerrain.ts`, `world/secondMapTerrain.test.ts` | 지형 비용에 그림 층 |
| `apps/server/src/app.ts`·`main.ts`·`session.ts`, `trpc/gather.ts`(새)·`router.ts`·`context.ts`·`createContext.ts` | 잇기(게이트웨이·조회·팩 종류) |
| `apps/game/src/map/gather/*`(새: gatherState·gatherCommands·gatherData·gatherOverlay·GatherPanel·gather.css, 시험 gatherState), `SecondaryMapScreen.tsx`(잇는 줄만), `mapFeed.ts`(gather_result 건너뜀) | 2차맵 화면 |
| `apps/game/messages/{ko,en}.json` | 문구 67개 |
| `e2e/gather.spec.ts`(새) | 화면 시험·사진 |
| `docs/adr/2026-11-07-gather-objects.md`(새), `docs/questions/2026-11-07-gather-objects.md`(새), `docs/PLAN.md`(14장 한 줄), 이 기록, `docs/WORKLOG.md` | 결정·질문·기록 |

## 검사·시험 (개발 컨테이너, Node 24.22.1)
- 작업 중(Verified): sim `terrain`·`tuning` 시험, 프로토콜 21파일 140개, 서버 `gather/` 시험(순수 5 + 서비스 3), DB 시험 `gather.db.test.ts` 1개(채집 → 화물·남은 번수 저장 → 다시 켜도 그대로), 게임 `map/gather` 3개·`mapFeed` 시험 통과. 서버·게임 타입 검사, 바꾼 파일 oxlint 통과. `check:content --no-compat` 통과.
- 끝 검사·화면 시험: 아래 "끝 검사" 절.

## 함께 바꿔야 하는 파일
- 프로토콜 판을 다른 줄기와 합칠 때: `packages/protocol/src/version.ts`(17 설명), `gather.test.ts`·`travel.test.ts`(현재 − 1을 본다).
- 팩 core@51을 다른 줄기도 올렸으면 합칠 때 한 판으로(`content/core/manifest.json`).
- `SIM_VERSION` 19를 다른 줄기도 쓰면 합칠 때 번호를 맞춘다(`packages/sim/src/version.ts`).
- 마이그레이션이 다른 줄기와 같은 부모에서 갈라지면 그대로 합친다(AGENTS 6장 Drizzle).
- `SecondaryMapScreen.tsx`(600줄, 경고 문턱): `work/unit-control`이 같은 화면을 고친다. 채집은 잇는 줄 여섯 곳뿐이다(import·`useState(createGatherState)`·`onGroundTap` 한 줄·덧그림 붙이기/떼기·`gatherSink`·`<GatherPanel>`).

## 건드리지 말 것
- 오브젝트 번호 = 자리 배치 칸 차례(y × 256 + x)와 8×8 묶음(`OBJECT_BLOCK_CELLS`)은 저장된 상태 줄이 가리킨다. 바꾸면 줄이 다른 오브젝트를 가리킨다.
- 채집 화물은 원장 유닛 화물 위치(−유닛 ID)다. 메모리 화물로 바꾸지 않는다(다시 켜면 잃는다).

## 미검증·TODO·알려진 문제
- 채집 줄·안에 머묾은 메모리에만(다시 켜면 유닛은 그 자리에 선다, 질문 670). 피로는 정산의 직무 없는 쉼과 함께 돌아 채집 중 시간도 쉼으로 센다.
- 남의 계약 일꾼에게 채집을 시킬 수 없다(질문 664). 시설 직무 산출은 지도 오브젝트를 쓰지 않는다.
- 광맥은 숨김 자원이 아니다(질문 666). 떨어진 나무도 그림·엄폐는 그대로(질문 671). 숲 칸에 건물을 지을 수 있게 됐다.
- 정원사 오염 층의 열쇠가 2차맵 키(1차맵 칸)라고 보고 읽었다(Assumed: `npc/runtime.ts cellOf` = 도시의 2차맵 키). 오염이 있는 세계에서 다시 자람이 늦어지는지는 재지 않았다.
- NAS에서는 배포 뒤 본다.

## 사용자 결정 대기
- 없음(질문 660~672는 기획 세션에 — 모양만, 답이 없으면 지금 코드). 667은 D-234 정정이 필요하다.
