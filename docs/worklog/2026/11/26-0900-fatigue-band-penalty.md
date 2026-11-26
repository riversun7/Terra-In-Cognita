# 피로 구간 불이익(N23)을 직접 채집·직무·걷기에 건다

- 일시: 2026-11-26 09:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-26-fatigue-band-penalty.md`(새로 씀), 기획 D-430·49 N23, 앞 작업 기록 `2026/11/25-2315-cyborg-body-fatigue.md`("사용자 결정 대기"였던 것)

## 한 일

사용자 답("네, 적용")으로 피로 구간 불이익을 실제 판정에 걸었다. 값은 설정 칸 `fatigueBands` 그대로다(31~60 능력 −10%, 61~90 능력 −25%·이동 −15%, 91~120 능력 −50%·이동 −30%).

- **직무(직무 배치·노동 계약)**: 피로 구간마다 일 주기가 길어진다(기본 60초 → 66.7초 → 80초 → 120초). 주기마다 산출 1·피로 +1은 그대로다.
- **직접 채집**: 한 번 캐는 시간이 이끄는 유닛의 피로 구간만큼 길어진다(능력 900‰면 ÷ 0.9).
- **걷기**: 걷는 유닛의 빠르기에 이동 ‰를 곱한다(이동을 시작할 때의 피로). 탈것 봇·배는 그대로.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/sim/src/settle/settle.ts`, `settle.test.ts` | 정산 규칙의 피로 구간 일 주기 길이(`workBands`), 구간마다 한 번에 세는 셈 |
| `packages/sim/src/society/labor.ts`, `labor.test.ts` | `rulesWithFatigueBands`·`fatigueMoveSpeed`, 회복 규칙에 구간 얹기 |
| `apps/server/src/labor/workerRest.ts`, `workerRest.test.ts` | 쉼터 없는 유닛에도 구간 규칙을 준다 |
| `apps/server/src/gather/rules.ts`, `service.ts`, `objects.test.ts` | 직접 채집 한 번의 시간에 능력 ‰ |
| `apps/server/src/world/walkSpeed.ts`, `walkSpeed.test.ts` | 걷기 빠르기에 이동 ‰ |
| `apps/server/src/gather/station.db.test.ts` | 피로 기대값(새 규칙) |
| `apps/game/src/home/cards/CyborgCard.tsx`, `packages/sim/src/combat/moves.test.ts` | main에 남은 검사 실패 고침(위 "같이 고친 것") |
| `docs/adr/2026-11-26-fatigue-band-penalty.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- 정산 규칙(`JobRules`)을 새로 만드는 곳은 `rulesWithFatigueBands`(또는 `rulesWithRecovery`)를 거친다. 거치지 않으면 그 유닛은 불이익이 없다.

## 건드리지 말 것

- `settle.ts` `advanceJob`: 주기 길이는 주기가 끝나 피로가 오를 때만 바뀐다(주기 가운데서 바꾸면 나눠 정산한 값이 달라진다).

## 미검증·TODO·알려진 문제

- Verified(깨끗한 작업 복사본, `ba459fbc` + 이 변경): `pnpm check` 통과(시험 6,244개 통과·430개 건너뜀).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 385파일 2,269개 통과. 채집소 시험(`gather/station.db.test.ts`)의 피로 기대값은 새 규칙 값으로 고쳤다(90분에 90주기 → 80주기, 피로 45 → 40).
- 같이 고친 것(다른 작업 커밋 `b644f323`·`ba459fbc`가 main에 남긴 검사 실패 — 푸시 전 훅이 막는다):
  - `apps/game/src/home/cards/CyborgCard.tsx`: 타입 오류(거르는 함수 안에서 상태 좁히기가 이어지지 않음) — 받은 자료를 먼저 꺼내 쓴다. 동작은 같다.
  - `packages/sim/src/combat/moves.test.ts`: 기본 아머 재생이 0이 되어 바뀐 시범 전투 지문 셋을 다시 떴다(값만, 머리 주석에 까닭).
- 판정 시험: 구간 정산이 1ms씩 따라간 참조 구현과 같고 나눠 셈해도 같다(`settle.test.ts`), 구간이 없으면 옛 셈과 같다.
- 실제 화면에서 피로가 쌓인 유닛이 느려지는 것은 보지 않았다(미실행).
- 한 번 일 단계(피로 0 → 120)가 120분에서 약 162분으로 길어진다. 같은 시간의 산출이 준다.
- NPC 시설 일자리의 임금 상한은 피로를 넣지 않은 기대 금액이다(NPC 몫 20%가 받친다).
- 걷기는 이동을 시작할 때의 피로(마지막 정산 값)를 쓴다. 이미 걷는 중인 이동은 바뀌지 않는다.
- 전투의 능력 불이익(공격·명중·공속)은 걸지 않았다. 채집 예상 화면도 피로를 넣지 않는다.
- 시뮬레이터 시나리오는 구간을 쓰지 않는다.
- 화면에 "피로로 느려짐" 표시는 없다.

## 사용자 결정 대기

- 전투에도 피로 능력 불이익을 걸지.
