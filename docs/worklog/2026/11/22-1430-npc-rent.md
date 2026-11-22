# 2026-11-22 npc-rent — NPC 휴먼도 남의 집에 세 든다(기획 검토 2674, D-555 1509)

- 일시: 2026-11-22 14:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 검토 2674(코디네이터 전달 — 2674 가 "NPC는 세 들지 않는다"가 D-555 1509 "똑같이"와 어긋남), 2671~2673·2675~2678 기술 기본값 확정. D-581·D-585·D-588 4(임대료 선납)·
  D-591 2(남의 집 세 들기), D-323(성향 규칙식), D-584(정하지 않은 모양은 [임시] + 질문).
  ADR `docs/adr/2026-11-15-business-ledger.md` "바뀜 (npc-rent)". 답 표시 `docs/questions/2026-11-22-residence-3.md`, 새 질문 `docs/questions/2026-11-22-npc-rent.md` 2731~2735.
- 가지 `work/npc-rent`, 바탕 main 801e782fab(묶음 1117h)

## 한 일
1. **NPC 세 들기**(`apps/server/src/residence/npcRent.ts`, 새): NPC 세력의 거울 세계 휴먼이 플레이어와 같은 사는 곳 장부(`unit_residences`)에 세 든 집을 적는다.
   정원(층 × 설정 칸)·첫 기간 미리 내기·1분 다음 기간 걷기·못 내면 쉼(빚 없음)·주민세 집 몫(`withChosenResidences`)이 그대로 돈다. 플레이어 가문 휴먼은 고르지 않는다(주인이 고른다).
   - 내는 쪽: 휴먼 지갑(`unitPurseLocation`), 그 도시 주인 나라 화폐(NPC 숙박비와 같다). 집세(서버 시험 화폐)는 지난 환전 체결가로 바꾸고 올린다(`npcRentWorld.ts convertUp`, [임시 2731]).
     받는 곳 = 사업장 금고(`BusinessCore.receive`, 소득세, `residence_rent`). `npcAwarePayer`가 NPC 휴먼이면 이 길, 아니면 플레이어 길 그대로.
   - 판단(D-323 [임시], 설정 칸 `npc_rent_*`): 지갑 ≥ 집세 × 2기간, ① 노숙 일꾼 → 가장 싼 집, ② 숙소 일꾼 → 집세 ≤ 한 기간 숙박비 × 의향(1000 + (500 − greed) × 200 ÷ 500) ÷ 1000인 가장 싼 집,
     같은 값은 레벨 높은 집. 내 세력 집·지금 쉬는 숙소 건물은 고르지 않는다. 세 든 뒤 쉼터는 그대로(2732).
   - 그만두기: 죽음·주인 바뀜·다른 도시·경비대 → 고른 것을 지운다. 못 내 쉬는 것은 남긴다.
   - 1분 훑기(`attach.ts`) = 다음 기간 걷기 → NPC 세 들기 → 쉼. 세를 놓은 집이 있는 도시의 고른 것 없는 휴먼만, 유닛 ID 커서로 이어 가며 `npc_rent_sweep_cap`(200)명까지.
2. **장부 건물 색인**(`book.ts`): 정원·사는 수 셈이 그 건물을 고른 것만 훑는다(전에는 고른 것 모두 — 쉼 훑기·다음 기간 걷기가 고른 것 n개에 O(n²)). 장부의 유닛 주인은 2차맵에 없으면 거울 세계 휴먼 주인.
3. **NPC 밤 숙박비**(`npc/npcWages.ts`): 세 든 집(미리 낸 기간 안)이 그 일꾼이 쉬는 숙소면 밤 숙박비를 걷지 않는다 — 플레이어 `workerRest.ts prepaidAt`와 같다.
4. **설정 칸 5개**(`content/core/tuning.json`, `packages/sim/src/tuningBusiness.ts`·`society/businessCoefficients.ts` — 서버만 읽음): `npc_rent_mode` 1, `npc_rent_sweep_cap` 200,
   `npc_rent_factor_pm` 1000, `npc_rent_temper_pm` 200, `npc_rent_reserve_pm` 2000 — 모두 [임시] 기술 기본값.
5. 잇기: `gather/world.ts`가 NPC 런타임(`world.npc`)을 늦게 읽는 고리로 넘긴다(같은 런타임이면 같은 몫 — `npcRentWorld.ts npcRentWorldOf`).

## 판·마이그레이션·리셋
- 줄기 판(묶음 때 다시 매긴다): 프로토콜 **그대로**(새 메시지 없음 — 조회 `occupants`에 NPC가 함께 든다), 팩 **core@206**(설정 칸 +5), SIM_VERSION **그대로**, 시뮬 출력 형식 그대로.
- 마이그레이션 **없음**(`unit_residences`에 NPC 휴먼 줄이 든다 — 외래 키 없음. 처리할 일 `residence_paused`는 사용자 계정 주인만 본다).
- **리셋 필요 없음.** 배포 뒤: 플레이어가 집세를 정한 집이 있는 도시에서 노숙하는 NPC 일꾼(지갑에 두 기간 몫)이 1분마다 200명씩 세 든다. 정원이 차면 플레이어 유닛도 `full`을 받는다(고른 차례).

## 시뮬 전·후
Verified — 실행, `node cli/sim.ts econ16 --seed 1 --days 30`. 바탕 = 같은 작업 트리에서 `packages/sim/src`·`content/core`만 git stash로 되돌린 코드. 줄 수 같음(769),
jsonl md5 바탕 0422d7350b341521f581382eb5c18a34 / 이 줄기 353ab54a28b3e71d1064af1a388610ea, `content`·`linesHash`를 뺀 md5 둘 다 b5a93a08f61391330acb19b6626a3b48.
시뮬에는 플레이어 건물·집세가 없다 → **SIM_VERSION 그대로**.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/residence/npcRent.ts`(새, + 시험 `npcRent.test.ts`)·`npcRentWorld.ts`(새) | NPC 고르기 규칙식·훑기·NPC 화폐 값 셈/걷기, NPC 런타임 몫 |
| `apps/server/src/residence/book.ts` | 건물 색인(성능), 머리 주석 |
| `apps/server/src/residence/rent.ts` | 집세 표 `all()`, 머리 주석 |
| `apps/server/src/residence/attach.ts` | NPC 몫·NPC 값 셈 잇기, 1분 훑기에 NPC 세 들기, 유닛 주인 거울 세계 대체 |
| `apps/server/src/gather/world.ts` | NPC 런타임 고리 |
| `apps/server/src/npc/npcWages.ts` | 세 든 숙소의 밤 숙박비 건너뜀 |
| `content/core/tuning.json`·`manifest.json`, `packages/sim/src/tuningBusiness.ts`·`society/businessCoefficients.ts` | 설정 칸 5개, core@206 |
| ADR "바뀜 (npc-rent)", 질문 답 표시·새 질문, 이 기록 | 문서 |

## 함께 바꿔야 하는 파일
- 묶음과 합칠 때: 팩 core@206 → 묶음 판(`manifest.json`, ADR 판 줄, 이 기록).
- 2673을 나라 화폐로 옮기면(2731 다): `residence/npcRentWorld.ts convertUp` 바꾸기를 지우고 `attach.ts feeAsset`·`npcRent.ts npcAwarePayer`를 같은 화폐로.
- 2732 나(세 든 집 = 쉼터)로 가면: `npc/cityRest.ts planCityRest`·`labor/workerRest.ts`가 사는 곳 장부를 읽고, `npcRent.ts`의 "지금 쉬는 숙소는 고르지 않는다"를 뺀다.

## 건드리지 말 것
- 다른 줄기 파일(npc-diplo·d593·no-teleport-a/b·league-3)은 건드리지 않았다. `npc/economy.ts`·`npc/runtime.ts`도 손대지 않았다(필요 없었다 — 1,000줄 상한은 풀렸다고 전달받음).

## 검사
- 작업 중(Verified — 실행): 서버 `residence`·`npc/npcWages`·`npc/residentProperty`·`labor` 18파일 83시험(새 `npcRent.test.ts` 9 포함, DB 시험 포함), sim `tuning` 3파일 47, 서버 타입 검사.
- 끝 전체 `pnpm check`(TEST_DATABASE_URL, DB 시험 포함 — Verified 실행): 첫 판은 포맷 3곳, 둘째 판은 oxlint 둘(`unbound-method` — `rules: parts.rules`, 시험의 `no-unsafe-type-assertion`)로 멈춰 고쳤다. 셋째 판: 포맷·린트·타입·경계·크기·다국어(9,004키)·디자인 값(746쌍)·콘텐츠(core@206 0bc08c5436fd) 통과, 시험 파일 **900/900**·시험 **6,429/6,429**.

## 미검증·TODO·알려진 문제
- 실제 세계에서 NPC가 세 드는 것을 끝까지 돌려 보지 않았다(미실행 — 단위 시험만).
- 커서는 메모리 — 다시 켜면 처음 휴먼부터. NPC 고르기 표 쓰기와 걷기 사이 지갑이 줄면 표 줄을 지운다(남기지 않는다).
- 세를 놓은 집이 있는 도시의 휴먼 ID 목록을 1분마다 모아 정렬한다(휴먼 수천 명이면 한 번에 수 ms — Assumed, 재지 않음).
- 서버 기록에 NPC 세 들기 수를 남기지 않는다(1분 지표 없음).

## 사용자 결정 대기
- 새 질문 2731~2735(`docs/questions/2026-11-22-npc-rent.md`).
