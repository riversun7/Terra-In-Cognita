# R5b 정원사: 칸 오염 층·도시 웨이브(공성 전투)·모함 몫·유목 부대, 시뮬과 서버

- 일시: 2026-11-01 17:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-01-gardener-r5b.md`(새), `docs/adr/2026-11-01-npc-brain-r5.md`(9절 바뀜 메모), 기획 D-460(질문 199~202)·D-464(질문 214~225, 217 고침)·D-468(질문 240 가, 49 C16a), 질문 `docs/questions/2026-11-01-r5b.md`(214~225·240 답 받음). 가지 `work/r5b`(main `2c17006`에서, main `b8a06f6`까지 합침)

## 한 일
- 질문 214~225를 먼저 쓰고(D-267, 가로 구현) 메인에 경로를 보냈다. 기획이 D-464로 답했다: 11개 가, 217 고침(모든 도시를 잃은 세력은 떠도는 세력 — 화폐 바로 사라짐, 갈 곳 없는 휴먼은 노숙, 구성원이 모두 떠나야 사라짐). 질문 파일에 답을 적었다.
- 시험 먼저(tdd): `gardener/pollution.test.ts`(상한·자연 감소 올림·퍼짐·숲·정화·차례 무관·영향권), `waves.test.ts`(확률·쉬는 시간·비트 길이 ⌊log2⌋·세기·도착·물리형·모함 몫), `nomads.test.ts`(처음 부대·종류 문턱·목표 고르기·제외·규모·떠돎) → 빨강 → 구현. 이어 `societyRuin.test.ts`(시작 도시 피해, 폐허·피난, 떠도는 세력·노숙·만족도·사라짐, 도시를 다시 얻으면 노숙 휴먼이 든다), `gardenerRun.test.ts`(기본 켬·바이트 같음, 끔, 예고 → 8시간 → 공성 전투 → 피해·폐허·쉬는 시간·떠도는 세력, 오염 없으면 웨이브 없음), 서버 `gardener.db.test.ts`(미리 넣은 오염 → 하루 끝 웨이브 셋 예고 → 처리할 일 `wave_incoming` → 8시간 뒤 전투 서비스 공성 → 다시 켜면 결과·쉬는 시간·연구 시설 −1, 정원사 상태 저장), `inbox/registry.test.ts`(DB가 있으면 웨이브 예고 제공 함수).
- sim 순수 함수 `packages/sim/src/gardener/`(계수·오염·웨이브·유목), 계수표 `SocietyCoefficients.gardener`, 설정 칸 30개(`tuningGardener.ts`, 팩 `tuning.json` 단위·기술 범위), 시설 콘텐츠 `pollution` 칸(스키마 선택 칸, [임시] 농장 1·주방 1·벌목장 2·공방 4·광산 6·제련소 8).
- 시뮬레이터: `gardenerRun.ts`(시뮬·서버 공용 `attachGardener`), `waveBattle.ts`(웨이브 공성 시작 자료·이길 수 없게 된 웨이브 멈춤, 서버도 씀), 경제 생산 → 시설 오염, 전투 줄 → 전투 오염(`battle` 줄 `city` 칸), 폐허(`society.ruin`·경제 `cityRuined`), 시작 도시 피해(`society.damage`), 노숙(`HOMELESS`)·떠도는 세력·사라짐(`dispersed`), 불변 조건 I4(노숙 받음)·E3(떠도는 세력의 화폐)·G1~G3. 시나리오 `gardener.enabled`(기본 켬), 출력 형식 판 7.
- 서버: NPC 사회 런타임에 정원사(`npc/gardener.ts`, 행성 칸 키·`neighbors8`, 설정 칸 실효 값), 웨이브 도착 → 전투 서비스 공성(`battles.start`), 전투 끝 알림(부팅 때 먼저 끝난 것은 모아 둠) → 다음 틱 결과, 다시 켤 때 싸우던 웨이브 처리, 저장(`persist.ts`: 칸 오염·웨이브 줄·쉬는 시간·`npc_society.gardener`, 폐허 도시 행 지우기, 노숙 휴먼 city_id null), 처리할 일 `wave_incoming` 제공 함수(`npc/waveInbox.ts`, 등록부·홈 서비스·맥락에 DB 연결), 1분 지표 `gardenerMs`·`gardenerWaves`·`gardenerWaveResults`·`pollutionCells`, 서버 기록 `battle computed`.
- 마이그레이션 `20261101092559_gardener`(추가만): `planet_pollution`, `gardener_waves`, `world_cities.wave_cooldown_until_ms`, `world_humans.city_id` null 허용, `npc_society.gardener`. `schema.ts`가 1,000줄을 넘어 정원사 표를 `db/gardenerSchema.ts`로, 행성 ID 열을 `db/planetColumns.ts`로 나눔(`db:generate` = No schema changes 확인).
- 전투 서비스 빨리감기를 조각(10틱)마다 이벤트 루프에 양보하게 바꿈(NAS 측정에서 한 번에 돌리던 계산·50틱 조각이 루프 p99를 올림). 웨이브 공성 제한(C2)은 실효 값을 `limitMs`로 넘김.
- 웨이브 크리쳐 사양·진형을 잰 결과로 [임시]를 고름(ADR 4절): 크리쳐 종류 타고난 무기·지팡이·맨 앞 공성 크리쳐는 웨이브가 거의 늘 짐(econ16 첫 실행 웨이브 전투 332번 중 웨이브 승 1번) → 수비 휴먼과 같은 사양, 물리형은 줄 끝.
- main을 네 번 합침(D-457~D-459 전투, D-465 무기 자료, 밸런스 화면·SIM_VERSION 4, 49 미러 C16a·끼운 칸 코드 `b8a06f6`). 팩 판 core@19(main core@18 + 1). 정원사 마이그레이션은 main 머리(`20261101075739_tuning_stat_cells`) 위에서 다시 만듦(`20261101092559_gardener`, 아직 올리지 않은 것이라 지우고 다시 만듦). `SIM_VERSION`은 올리지 않음(기존 판정 함수의 같은 입력 결과는 그대로).
- 잰 결과 웨이브가 거의 늘 막혀(독점 견제가 결과로 드러나지 않음) 질문 240(웨이브 결과의 목표, 가 = 목표를 정하고 C16·C17 출발값을 시뮬로 맞춤)을 더하고 메인에 경로를 보냄.
- D-468(질문 240 가): 새 설정 칸 49 C16a 두 개(`c16a_target_win` 333‰·`c16a_target_sum` 30,000, 팩 `code: "C16a"`, 단위·기술 범위, 계수표 `targetWinPm`·`targetSum`, 서버 반영 "sim"), 시뮬 요약 `gardener.target`(생길 때 합이 기준 이상·미만인 웨이브의 승률), 맞추기 도구 `gardener:cal`(`packages/sim/cli/gardener-cal.ts`, 시뮬·서버와 같은 웨이브 함수). 세기 기본 × 물리형 나눗수 격자로 맞춰 **C16 세기 기본 4 → 5, C17 물리형 나눗수 200 → 100**(팩·계수표). 시험(`waves`·`nomads`)은 공식을 옛 값으로 고정해 두고, 새 출발값과 "기준 세력이 합 30,000에서 물리형 4마리"를 따로 시험한다. `tuning.test.ts`에 C16a 칸 시험.
- AGENTS 명령표(시뮬·NPC 런타임 줄, `gardener:cal` 줄), R5 ADR 9절 바뀜 메모.

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
| `packages/sim/src/society/coefficients.ts`·`tuning.ts`·`tuningGardener.ts`·`tuning.test.ts`·`index.ts` | 계수표 `gardener` 칸, 설정 칸 32개(C16a 둘 포함), 내보내기 |
| `packages/sim/cli/gardener-cal.ts`, `packages/sim/package.json` | D-468 맞추기 도구 `gardener:cal` |
| `packages/content/src/schema/economy.ts`, `content/core/{facilities,tuning,manifest}.json` | 시설 `pollution` 칸, 설정 칸 값·단위·범위, 팩 판 19 |
| `apps/server/src/npc/{gardener,waveInbox}.ts`·`gardener.db.test.ts` | 서버 정원사·웨이브 예고 처리함 |
| `apps/server/src/npc/{runtime,persist,state}.ts` | 런타임 연결, 저장·불러오기(오염·웨이브·쉬는 시간·노숙·폐허) |
| `apps/server/src/world/{battles,world}.ts` | 조각 양보·웨이브 멈춤·`battle computed`, 전투 끝 알림, 전투 자료·계수 넘김 |
| `apps/server/src/world/persist/tables.ts` | 쓰기 대기열 표 `pollution`·`gardenerWaves`, 도시·NPC 상태 열 |
| `apps/server/src/db/{schema,gardenerSchema,planetColumns}.ts`, `apps/server/drizzle/20261101092559_gardener/` | 표 정의·마이그레이션(추가만), 파일 크기 상한으로 나눔 |
| `apps/server/src/{app.ts,home/services.ts,inbox/registry.ts,trpc/createContext.ts,tuning/scope.ts}`·`inbox/registry.test.ts` | 처리할 일 DB 연결, 전투 자료·계수 넘김, 정원사 칸 live |
| `packages/shared/src/inbox.ts`·`inbox.test.ts` | `wave_incoming` planned → false(제공 함수 생김) |
| `docs/adr/2026-11-01-gardener-r5b.md`, `docs/adr/2026-11-01-npc-brain-r5.md`, `docs/questions/2026-11-01-r5b.md`, `AGENTS.md` | 결정·측정, 9절 메모, 질문·답, 명령표 |

## 확인 (Verified, 개발 컨테이너)
- 시험 먼저: 새 시험(오염 8·웨이브 7·유목 5·폐허·떠도는 세력 4·시뮬 정원사 4·서버 DB 1·처리할 일 1)이 구현 전 빨강, 구현 뒤 초록. D-468: C16a 칸 연결·새 출발값 시험을 더함(`tuning.test.ts`·`waves.test.ts`).
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 통과(시험 파일 330, 시험 2,820, main `1f2ab3d`를 합치고 마이그레이션을 다시 만든 트리 = 커밋 `79846e5`). `pnpm --filter @terra/game typecheck`를 먼저 돌림. 합치기 전에도 통과(327·2,780, `4bb4d07`). D-468 맞춘 값 뒤 다시 통과(330·2,823, 커밋 `8b756d3`).
- `pnpm --filter @terra/server db:generate`: 표 정의를 나눈 뒤 "No schema changes".
- `pnpm check:content origin/main`: 통과(core@19 `5a9119d0ec21`, 기준 `b8a06f6`, 단계 1·2·4a·4b).
- `pnpm e2e`(전체): 마지막 = 227 통과·1 건너뜀(측정 시험 `E2E_MEASURE`), 22.6분(커밋 `8b756d3` 빌드 = D-468 맞춘 값·C16a 칸, main `b8a06f6` 합침. 설정 칸·밸런스 화면 시험 포함). 앞서 214 통과·1 건너뜀(25.2분, `4bb4d07`), 227 통과·1 건너뜀(22.1분, `3595617`).
- D-391 시뮬, D-468 맞춘 값(SIM_VERSION 4 위, main `b8a06f6` 합침, 시드 1 켬 두 번 바이트 같음, 열 실행 모두 위반 0): ADR "D-468 뒤 D-391" 표. 도시 몫 최대 끔 → 켬: econ16 시드 1 12.7 → 16.7%, 시드 2 15.6 → 21.1%, 시드 3 11.9 → 15.4%(180일), war16 6.2 → 6.2%(30일, 웨이브 2번 모두 물리형 0), stub16 6.2%(오염 0). 웨이브 승 31·43·33(모두 세기 20 = 큰 세력, 107번 중 103번이 도시 6개 이상 세력, 48번이 가장 큰 세력). 가장 큰 세력 평균 크기는 줄지만(8.54 → 7.94 등) 폐허가 세계 도시 수를 줄여(180일 72 → 58 등) 몫은 오른다. 줄 해시 켬/끔(시드 1): stub16 `25045510`/`99f3038b`, econ16 `73c85048`/`b6e125bd`, war16 `a9aa68f7`/`d1fa908c`. 시드 2·3 econ16: `51d8be70`/`6852f94b`, `e2411096`/`322f9280`.
- D-468 맞추기(`gardener:cal`, ADR "바뀜 (D-468)" 표): 목표 구간(합 ≥ 30,000) 기준 세력 웨이브 승률 시드 1~12 354‰, 13~24 208‰, 합 281‰(목표 333‰). 합 ≤ 25,000은 0‰, 수비 15는 0‰, 큰 세력(도시 9) 1000‰, 작은 세력(도시 1) 0‰.
- D-391 맞추기 전(세기 기본 4·나눗수 200, 커밋 `3595617`): econ16 켬 = 웨이브 895·전투 326·웨이브 승 3(폐허 3), 도시 몫 최대 12.7% → 13.0%(ADR "결과 측정" 표, 줄 해시 켬/끔 stub16 `ff3b12a7`/`aa32ad84`, econ16 `4ce80b63`/`6b88ded2`, war16 `8f236dfa`/`00ee9381`).
- NAS 안전(빌드한 서버, 봇 1,000, `NPC_DAY_MS=60000`, 오염을 미리 넣어 웨이브 전투를 일으킴): ADR "NAS 안전" 표. 50틱 조각에서 루프 p99 55.7·50.3ms(넘음) → 10틱 조각으로 줄임. 최종 사양(10틱 조각·지팡이 마법형, 커밋 `ca752f8`과 같은 코드 — SIM 4 합치기 전 빌드) 8분: 루프 p99 ≤ 13.3ms, 최대 146ms, RSS 310~321MB, 웨이브 전투 9번(CPU 0.7~1.9초). D-468 맞춘 값(커밋 `8b756d3` 빌드, 세기 50·물리형 25) 8분: 루프 p99 ≤ 13.1ms, 최대 128ms, RSS 323~369MB, 웨이브 전투 10번(CPU 0.55~1.22초, 가장 긴 조각 42ms), 웨이브 승 7.

## 함께 바꿔야 하는 파일
- 크리쳐 에디터 값(D-5024)이 생기면 `waveBattle.ts`의 [임시] 크리쳐 사양·진형·건물 피해 배율, 그다음 `gardener:cal`로 C16·C17을 다시 맞춘다(D-468).
- **D-469(하루 출생 없앰 → 인구는 행정 건물 모집 카드로만, 상속은 소유자에게만, main `e9582d1` 미러, 아직 구현 안 됨)가 들어오면 웨이브 맞추기를 다시 한다**: 세기는 휴먼 수(⌊휴먼 ÷ 50⌋)를 따르고 시나리오의 세력 크기·점령·폐허 흐름도 인구 동역학을 따르므로, `gardener:cal`(기준 세력 크기 다시 잡기)과 D-391 정원사 켬·끔을 다시 돌려 C16·C17 출발값을 확인한다. 지금 값(5·100)은 출생이 있는 지금 사회 모델에서 맞춘 값이다.
- 진군 경로(D-188 표시)가 생기면 `waveArrivalMs`의 이동 시간(지금 0).
- 영향권 반경 규칙(M3·M5), 정화 직무(D-310 → `purify`), 행성 바이옴 질의(서버 숲 칸), 영향권 밖 시설·전초기지 층(유목 부대 싸움).
- 전투 서비스가 더 많은 전투를 맡으면 빨리감기를 워커로(ADR 6절).
- 설정 칸 49 미러에 P15·C14~C18·S16·S17 출발값이 들어오면 `pnpm settings:cells`. C16·C17 출발값은 D-468 맞춘 값(5·100)을 기획에 알렸다(이 보고).

## 건드리지 말 것
- 전투 공식(`packages/sim/src/combat/`)은 고치지 않았다(전투 API·`specOf`만 부름).
- 올라간 마이그레이션(`20261101092559_gardener`)은 고치지 않는다(main에 합친 뒤부터).

## 미검증·TODO·알려진 문제
- NAS(R1600) 값은 미측정. 30분짜리 웨이브 전투 하나가 개발 컨테이너에서 CPU 약 16.5초였다(ADR "NAS 안전").
- 서버 메모리 도시 목록(`world/cities.ts`)은 폐허를 다시 켜기 전까지 모른다(시작 도시는 폐허가 되지 않음).
- 폐허 도시로 가던 운송 화물은 받을 곳 없이 도착한다(시뮬 경제).
- 서버 전투 서비스는 전투 규칙을 시험 계수표로 만든다(R3 그대로, 웨이브 공성 제한만 실효 값).
- 웨이브 폐허의 복원 모금(D-339)은 기획 미결(D-464). 정원사를 켜면 도시 몫 최대가 오른다(econ16 세 시드 +3.5~5.5%p): 웨이브 승이 큰 세력을 치지만 폐허가 세계 도시 수를 줄여 몫의 분모가 더 빨리 준다(ADR "D-468 뒤 D-391"). 복원이 정해지면 다시 잰다.
- 시나리오 세계 도시의 영향권 합은 2만 남짓에서 멈춰 목표 구간(≥ 30,000) 웨이브가 시나리오에는 없다. 목표 구간 승률은 `gardener:cal`(웨이브 단위)로만 쟀다.
- 웨이브 결과가 계단처럼 갈린다(크리쳐 한 마리 = 수비 한 명 [임시]). 크리쳐 에디터 값(D-5024) 뒤 다시 맞춘다.

## 사용자 결정 대기
- 없음(214~225 D-464, 240 D-468 답 받음).
