# R5b 정원사: 칸 오염 층·도시 웨이브(공성 전투)·모함 몫·유목 부대, 시뮬과 서버

- 일시: 2026-11-01 17:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-gardener-r5b.md`(새), `docs/adr/2026-11-01-npc-brain-r5.md`(9절 바뀜 메모), 기획 D-460(질문 199~202)·D-464(질문 214~225, 217 고침), 질문 `docs/questions/2026-11-01-r5b.md`(214~225 답 받음, 240 답 기다림). 가지 `work/r5b`(main `2c17006`에서, main `1f2ab3d`까지 합침)

## 한 일
- 질문 214~225를 먼저 쓰고(D-267, 가로 구현) 메인에 경로를 보냈다. 기획이 D-464로 답했다: 11개 가, 217 고침(모든 도시를 잃은 세력은 떠도는 세력 — 화폐 바로 사라짐, 갈 곳 없는 휴먼은 노숙, 구성원이 모두 떠나야 사라짐). 질문 파일에 답을 적었다.
- 시험 먼저(tdd): `gardener/pollution.test.ts`(상한·자연 감소 올림·퍼짐·숲·정화·차례 무관·영향권), `waves.test.ts`(확률·쉬는 시간·비트 길이 ⌊log2⌋·세기·도착·물리형·모함 몫), `nomads.test.ts`(처음 부대·종류 문턱·목표 고르기·제외·규모·떠돎) → 빨강 → 구현. 이어 `societyRuin.test.ts`(시작 도시 피해, 폐허·피난, 떠도는 세력·노숙·만족도·사라짐, 도시를 다시 얻으면 노숙 휴먼이 든다), `gardenerRun.test.ts`(기본 켬·바이트 같음, 끔, 예고 → 8시간 → 공성 전투 → 피해·폐허·쉬는 시간·떠도는 세력, 오염 없으면 웨이브 없음), 서버 `gardener.db.test.ts`(미리 넣은 오염 → 하루 끝 웨이브 셋 예고 → 처리할 일 `wave_incoming` → 8시간 뒤 전투 서비스 공성 → 다시 켜면 결과·쉬는 시간·연구 시설 −1, 정원사 상태 저장), `inbox/registry.test.ts`(DB가 있으면 웨이브 예고 제공 함수).
- sim 순수 함수 `packages/sim/src/gardener/`(계수·오염·웨이브·유목), 계수표 `SocietyCoefficients.gardener`, 설정 칸 30개(`tuningGardener.ts`, 팩 `tuning.json` 단위·기술 범위), 시설 콘텐츠 `pollution` 칸(스키마 선택 칸, [임시] 농장 1·주방 1·벌목장 2·공방 4·광산 6·제련소 8).
- 시뮬레이터: `gardenerRun.ts`(시뮬·서버 공용 `attachGardener`), `waveBattle.ts`(웨이브 공성 시작 자료·이길 수 없게 된 웨이브 멈춤, 서버도 씀), 경제 생산 → 시설 오염, 전투 줄 → 전투 오염(`battle` 줄 `city` 칸), 폐허(`society.ruin`·경제 `cityRuined`), 시작 도시 피해(`society.damage`), 노숙(`HOMELESS`)·떠도는 세력·사라짐(`dispersed`), 불변 조건 I4(노숙 받음)·E3(떠도는 세력의 화폐)·G1~G3. 시나리오 `gardener.enabled`(기본 켬), 출력 형식 판 7.
- 서버: NPC 사회 런타임에 정원사(`npc/gardener.ts`, 행성 칸 키·`neighbors8`, 설정 칸 실효 값), 웨이브 도착 → 전투 서비스 공성(`battles.start`), 전투 끝 알림(부팅 때 먼저 끝난 것은 모아 둠) → 다음 틱 결과, 다시 켤 때 싸우던 웨이브 처리, 저장(`persist.ts`: 칸 오염·웨이브 줄·쉬는 시간·`npc_society.gardener`, 폐허 도시 행 지우기, 노숙 휴먼 city_id null), 처리할 일 `wave_incoming` 제공 함수(`npc/waveInbox.ts`, 등록부·홈 서비스·맥락에 DB 연결), 1분 지표 `gardenerMs`·`gardenerWaves`·`gardenerWaveResults`·`pollutionCells`, 서버 기록 `battle computed`.
- 마이그레이션 `20261101073102_gardener`(추가만): `planet_pollution`, `gardener_waves`, `world_cities.wave_cooldown_until_ms`, `world_humans.city_id` null 허용, `npc_society.gardener`. `schema.ts`가 1,000줄을 넘어 정원사 표를 `db/gardenerSchema.ts`로, 행성 ID 열을 `db/planetColumns.ts`로 나눔(`db:generate` = No schema changes 확인).
- 전투 서비스 빨리감기를 조각(10틱)마다 이벤트 루프에 양보하게 바꿈(NAS 측정에서 한 번에 돌리던 계산·50틱 조각이 루프 p99를 올림). 웨이브 공성 제한(C2)은 실효 값을 `limitMs`로 넘김.
- 웨이브 크리쳐 사양·진형을 잰 결과로 [임시]를 고름(ADR 4절): 크리쳐 종류 타고난 무기·지팡이·맨 앞 공성 크리쳐는 웨이브가 거의 늘 짐(econ16 첫 실행 웨이브 전투 332번 중 웨이브 승 1번) → 수비 휴먼과 같은 사양, 물리형은 줄 끝.
- main을 세 번 합침(D-457~D-459 전투, D-465 무기 자료, 밸런스 화면·SIM_VERSION 4). 팩 판 core@19(main core@18 + 1). 정원사 마이그레이션은 main 머리(`20261101075739_tuning_stat_cells`) 위에서 다시 만듦(`20261101092559_gardener`, 아직 올리지 않은 것이라 지우고 다시 만듦). `SIM_VERSION`은 올리지 않음(기존 판정 함수의 같은 입력 결과는 그대로).
- 잰 결과 웨이브가 거의 늘 막혀(독점 견제가 결과로 드러나지 않음) 질문 240(웨이브 결과의 목표, 가 = 목표를 정하고 C16·C17 출발값을 시뮬로 맞춤)을 더하고 메인에 경로를 보냄.
- AGENTS 명령표(시뮬·NPC 런타임 줄), R5 ADR 9절 바뀜 메모.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/gardener/{coefficients,pollution,waves,nomads}.ts`·`*.test.ts` | 오염 층·웨이브 공식·유목 부대 순수 함수(D-460·D-464) |
| `packages/sim/src/simulator/gardenerRun.ts`·`gardenerRun.test.ts` | 하루 끝 오염·굴림·예약, 도착·결과, 모함 몫, 서버와 공용 |
| `packages/sim/src/simulator/waveBattle.ts` | 웨이브 공성 시작 자료·멈춤 규칙(시뮬·서버 같은 함수) |
| `packages/sim/src/simulator/society.ts`·`societyTypes.ts`·`societyRuin.test.ts` | 폐허·시작 도시 피해·노숙·떠도는 세력·사라짐, 요약 `ruins` |
| `packages/sim/src/simulator/world.ts` | `HOMELESS`, I4가 노숙 휴먼을 받음 |
| `packages/sim/src/simulator/economy.ts`·`economyRun.ts`·`catalog.ts`·`cli/common.ts` | 생산 → 오염 몫, 폐허 도시 정리(`cityRuined`), E3, 시설 `pollution` |
| `packages/sim/src/simulator/combatRun.ts` | 도우미 내보내기(`kitOf`·`specOf`·`openMap`·`PARTY_SIZE`), 전투 줄 `city` |
| `packages/sim/src/simulator/run.ts`·`scenario.ts`·`metrics.ts`·`npcRun.ts` | 정원사 붙이기, 시나리오 칸, `wave`·`gardener` 줄, 형식 판 7, 노숙 만족도 지표 |
| `packages/sim/src/society/coefficients.ts`·`tuning.ts`·`tuningGardener.ts`·`index.ts` | 계수표 `gardener` 칸, 설정 칸 30개, 내보내기 |
| `packages/content/src/schema/economy.ts`, `content/core/{facilities,tuning,manifest}.json` | 시설 `pollution` 칸, 설정 칸 값·단위·범위, 팩 판 19 |
| `apps/server/src/npc/{gardener,waveInbox}.ts`·`gardener.db.test.ts` | 서버 정원사·웨이브 예고 처리함 |
| `apps/server/src/npc/{runtime,persist,state}.ts` | 런타임 연결, 저장·불러오기(오염·웨이브·쉬는 시간·노숙·폐허) |
| `apps/server/src/world/{battles,world}.ts` | 조각 양보·웨이브 멈춤·`battle computed`, 전투 끝 알림, 전투 자료·계수 넘김 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 `pollution`·`gardenerWaves`, 도시·NPC 상태 열 |
| `apps/server/src/db/{schema,gardenerSchema,planetColumns}.ts`, `apps/server/drizzle/20261101073102_gardener/` | 표 정의·마이그레이션(추가만), 파일 크기 상한으로 나눔 |
| `apps/server/src/{app.ts,home/services.ts,inbox/registry.ts,trpc/createContext.ts,tuning/scope.ts}`·`inbox/registry.test.ts` | 처리할 일 DB 연결, 전투 자료·계수 넘김, 정원사 칸 live |
| `packages/shared/src/inbox.ts`·`inbox.test.ts` | `wave_incoming` planned → false(제공 함수 생김) |
| `docs/adr/2026-11-01-gardener-r5b.md`, `docs/adr/2026-11-01-npc-brain-r5.md`, `docs/questions/2026-11-01-r5b.md`, `AGENTS.md` | 결정·측정, 9절 메모, 질문·답, 명령표 |

## 확인 (Verified, 개발 컨테이너)
- 시험 먼저: 새 시험(오염 8·웨이브 7·유목 5·폐허·떠도는 세력 4·시뮬 정원사 4·서버 DB 1·처리할 일 1)이 구현 전 빨강, 구현 뒤 초록.
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 통과(시험 파일 330, 시험 2,820, main `1f2ab3d`를 합치고 마이그레이션을 다시 만든 트리 = 커밋 `79846e5`). `pnpm --filter @terra/game typecheck`를 먼저 돌림. 합치기 전에도 통과(327·2,780, `4bb4d07`).
- `pnpm --filter @terra/server db:generate`: 표 정의를 나눈 뒤 "No schema changes".
- `pnpm check:content`: 통과(core@19, 단계 1·2·4a·4b) — 마지막 확인은 아래.
- `pnpm e2e`(전체): 214 통과·1 건너뜀(측정 시험 `E2E_MEASURE`), 25.2분(커밋 `4bb4d07` 빌드). 그 뒤 바꾼 것은 웨이브 크리쳐 무기(sim `waveBattle.ts`)·시험뿐이라 화면 흐름에는 닿지 않는다(웨이브는 오염이 쌓여야 오고 화면 시험 세계는 오염 0) — 아래 "마지막 확인"에 다시 돌린 결과를 적는다.
- D-391 시뮬(SIM_VERSION 4 위, 시드 1, 켬 두 번 바이트 같음, 끔·켬 모두 위반 0): ADR "결과 측정 — D-391 지표" 표. 줄 해시 켬/끔: stub16 `ff3b12a7`/`aa32ad84`, econ16 `4ce80b63`/`6b88ded2`, war16 `8f236dfa`/`00ee9381`. econ16 켬 = 웨이브 895·전투 326·웨이브 승 3(폐허 3), 도시 몫 최대 12.7% → 13.0%, 세 조건 그대로 통과. 독점 견제는 빈도에서만 보이고 결과로는 드러나지 않는다(웨이브가 거의 늘 막힘 → 질문 240). stub16은 오염 0, war16은 웨이브 2(물리형 0).
- NAS 안전(빌드한 서버, 봇 1,000, `NPC_DAY_MS=60000`, 오염을 미리 넣어 웨이브 전투를 일으킴): ADR "NAS 안전" 표. 50틱 조각에서 루프 p99 55.7·50.3ms(넘음) → 10틱 조각으로 줄임. 최종 사양(10틱 조각·지팡이 마법형, 커밋 `ca752f8`과 같은 코드 — SIM 4 합치기 전 빌드) 8분: 루프 p99 ≤ 13.3ms, 최대 146ms, RSS 310~321MB, 웨이브 전투 9번(CPU 0.7~1.9초).

## 함께 바꿔야 하는 파일
- 크리쳐 에디터 값(D-5024)이 생기면 `waveBattle.ts`의 [임시] 크리쳐 사양·진형·건물 피해 배율.
- 진군 경로(D-188 표시)가 생기면 `waveArrivalMs`의 이동 시간(지금 0).
- 영향권 반경 규칙(M3·M5), 정화 직무(D-310 → `purify`), 행성 바이옴 질의(서버 숲 칸), 영향권 밖 시설·전초기지 층(유목 부대 싸움).
- 전투 서비스가 더 많은 전투를 맡으면 빨리감기를 워커로(ADR 6절).
- 설정 칸 49 미러에 P15·C14~C18·S16·S17 출발값이 들어오면 `pnpm settings:cells`.

## 건드리지 말 것
- 전투 공식(`packages/sim/src/combat/`)은 고치지 않았다(전투 API·`specOf`만 부름).
- 올라간 마이그레이션(`20261101073102_gardener`)은 고치지 않는다.

## 미검증·TODO·알려진 문제
- NAS(R1600) 값은 미측정. 30분짜리 웨이브 전투 하나가 개발 컨테이너에서 CPU 약 16.5초였다(ADR "NAS 안전").
- 서버 메모리 도시 목록(`world/cities.ts`)은 폐허를 다시 켜기 전까지 모른다(시작 도시는 폐허가 되지 않음).
- 폐허 도시로 가던 운송 화물은 받을 곳 없이 도착한다(시뮬 경제).
- 서버 전투 서비스는 전투 규칙을 시험 계수표로 만든다(R3 그대로, 웨이브 공성 제한만 실효 값).
- 웨이브 폐허의 복원 모금(D-339)은 기획 미결(D-464).

## 사용자 결정 대기
- 없음(214~225 답 받음, D-464).
