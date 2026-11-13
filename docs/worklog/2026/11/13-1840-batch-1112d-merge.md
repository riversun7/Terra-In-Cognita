# 2026-11-13 다섯째 묶음 합치기 (광석 고도·시설 짓기·컨디션·지형 물체·운영자 속도·자원 분포·2차맵 화면·사이보그 판)

- 일시: 2026-11-13 18:40 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `12-2010-ore-3`·`12-2130-npc-build-2`·`12-2040-condition-2`·`12-2050-terrain-objects`·`12-2105-operator-speed`·`12-2120-resource-biome`·`12-2130-map-hud`·`12-2323-cyborg-sheet-3`, 기획 D-535·D-536, 새 질문 1176~1260

## 한 일
- 통합 가지에 줄기 여덟을 합쳤다: npc-build-2 → ore-3 → condition-2 → terrain-objects → operator-speed → resource-biome → cyborg-sheet-3 → map-hud.
- 버전: 팩 core@80, 프로토콜 26(최소 25), `SIM_VERSION` 33, 마이그레이션 `20261112111806_facility_seeded` 하나(더하기만).
- 손으로 푼 곳
  - `facilities/world.ts`·`world/world.ts`: condition-2의 `npc` 접근자와 ore-3의 `cellValues`를 함께 둔다(`world.ts` 1,000줄 — 상한).
  - resource-biome은 합치기 도우미가 통합 가지를 줄기에 합쳐 풀었다(17곳, 줄기 기록 끝 메모). 그때 통합 가지의 검사 실패 셋(시험 타입 둘, `world.ts` 1,001줄)도 함께 고쳤다.
  - cyborg-sheet-3·map-hud는 줄기 쪽에서 통합 가지를 합친 뒤 그대로 붙였다(map-hud 팩 79 → 80).
- 사용자 결정(이번 묶음 중, cyborg-sheet-3 기록·ADR 바뀜 절에 원문)
  - 맨손 크리 = AGI + DEX ‰, 맨손 명중 늘 100%.
  - 맨손 간격 = 2,000 ÷ (AGI ÷ 레벨 기준 AGI)², 0.25~5초. 무기 간격도 같은 꼴(적정 AGI 2배 상한, 최대 2.5배).
  - 물리 기본 공격력 STR + VIT÷2, 무기 공격력은 더하기. 원소 공격력 INT + WIS÷2.
  - 극공속은 스태미나로 막는다(D-511은 일반적인 경우).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/world.ts`, `apps/server/src/world/world.ts` | condition-2 + ore-3 합치기 |
| `docs/worklog/2026/11/12-2050-terrain-objects.md` | 검사 칸 채움 |

## 함께 바꿔야 하는 파일
- `apps/server/src/world/world.ts`는 1,000줄(상한)이다. 다음에 더할 것은 따로 모듈로 낸다.
- `packages/sim/src/index.ts`도 상한 근처다. 새 모듈은 묶음 파일(`export * from`)로 낸다.

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션 `20261112111806_facility_seeded`.

## 미검증·TODO·알려진 문제
- 검사(통합 가지 4c57331, Verified)
  - `pnpm check`: map-hud 줄기가 같은 트리(마지막 합치기는 빨리감기)에서 669 파일·5,098 시험 통과.
  - `check:docs`·`check:content`(core@80)·빌드·`check-pwa`·`check:bundle`(첫 화면 109,068 B / 131,416 B) 통과.
  - 화면 시험 18종(cyborg·formulas·gather-expect·gather-station·terrain-objects·operator-speed·map-hud·play-map·seamless·world-layout·planet-view·unit-control·units·unit-looks·facilities·government·production·city-layout): 182 통과·3 실패·2 건너뜀(측정 전용). 실패 셋(`units` 둘 — 보유 유닛 0 대신 1, `unit-control` 운영자 땅 누르기 하나)은 두 파일만 다시 돌리자 34/34 통과 → 앞 시험이 남긴 유닛·자리 때문인 차례 오염(Assumed, 알려진 문제).
- 도시 화면에서 건물을 열면 지도 일부가 빈 사각형으로 보인다(헤드리스에서만 확인, 원인 Unknown, 휴대폰 미확인).
- NPC 10일 시험(`guards.test.ts`)이 한 번에 약 1초 → 10초(웨이브 공성이 길어짐, 원인 미측정).
- 높은 레벨 + 낮은 무기는 스태미나가 공격 횟수를 막는다(사용자 결정, 질문 1258).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 기획 질문 1176~1260(줄기별 `docs/questions/2026-11-12-*.md`) — 기획 세션에 보낸다.
