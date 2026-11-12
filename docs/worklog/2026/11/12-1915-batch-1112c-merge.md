# 2026-11-12 다섯째 묶음 합치기 (D-534: 공성 2차·광석 2차·운반 2차·NPC 증축·컨디션·1차맵 레이어)

- 일시: 2026-11-12 19:15 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `12-1715-npc-build`·`12-1712-logistics-2`·`12-1715-planet-layers`·`12-1727-siege-2`·`12-1712-ore-2`·`12-1730-condition-gather`, 기획 D-534, 사용자 요청 2026-11-12("1차맵 레이아웃선택에 … 고도, 자원별 분포, 세력영토 레이아웃도 추가해달라"), 새 질문 1111~1172

## 한 일
- 통합 가지에 줄기 여섯을 합쳤다: npc-build(빨리감기) → logistics-2 → planet-layers → siege-2 → ore-2 → condition-gather.
- 버전 접기: 팩 core@76(네 줄기가 모두 76 — 판 하나로), `SIM_VERSION` 27(npc-build) · 28(siege-2) · 29(ore-2)로 차례로, 출력 형식 18(npc-build). 프로토콜·마이그레이션 없음.
- 손으로 푼 곳
  - siege-2가 도시 배치 함수를 `apps/server/src/facilities/cityLayout.ts`에서 `packages/sim/src/city/cityLayout.ts`(`@terra/sim/city`)로 옮겼고, npc-build는 `npcSeed.ts`에서 그 함수를 쓰는 부분을 `facilities/npcPlacement.ts`로 나눴다 → `npcPlacement.ts`가 `@terra/sim/city`에서 가져온다. `npcSeed.ts`의 import 충돌은 npc-build 쪽(가져오지 않음)으로.
  - `packages/sim/src/version.ts`: 27·28·29 설명을 차례로 두고 상수는 29 하나.
  - ADR `2026-11-11-city-building-layout.md` 바뀜 절·`WORKLOG.md`는 두 쪽을 모두 살렸다.
- 기존 실패 하나 고침: 사이보그 상세 전투 스펙에 HP 회복(`hp_regen`, D-514 팩 행)이 표(`COMBAT_ROWS`)에 없어 "기타" 묶음이 생겨 `e2e/cyborg.spec.ts`가 실패했다 → VITALS의 HP 바로 아래에 넣고 시험 기대값을 맞췄다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/facilities/npcPlacement.ts`, `npcSeed.ts` | 도시 배치 함수 자리 옮김에 맞춤 |
| `packages/sim/src/version.ts` | SIM 29 |
| `apps/game/src/cyborg/cyborgText.ts`, `e2e/cyborg.spec.ts` | HP 회복 행 |

## 함께 바꿔야 하는 파일
- 도시 배치는 `packages/sim/src/city/cityLayout.ts` 하나다(서버는 다시 내보내기·`npcPlacement.ts`가 쓴다). 서버 씨앗 차례(`npcSeed.ts` `seedPlan`)와 시뮬 `simCityFacilities` 차례는 같아야 한다.
- 자원 분포 레이어(`apps/server/src/planet/resourceMap.ts` `resourceRulesKey`): 칸 몫 규칙에 설정 칸을 더하면 이 키에도 넣는다.

## 건드리지 말 것
- 없음(이번 묶음은 마이그레이션이 없다).

## 미검증·TODO·알려진 문제
- 검사(통합 가지, Verified): `pnpm check` 658 파일·5,015 시험 통과, `check:docs`·`check:content`(core@76)·빌드·`check-pwa`·`check:bundle`(108,931 B / 131,416 B) 통과. 화면 시험 12종(cyborg·gather-expect·gather-station·gather-tiers·production·world-layout·planet-view·city-layout·units·unit-looks·play-map·facilities) 127 통과·실패 0.
- 광석 2차의 광산 국가 산지 점수(1079 나)는 시험 행성에서 산지가 극지에만 있어 철 캐는 국가가 여전히 0이다(질문 1121).
- 시작 도시 자리가 바뀐다(ore-2·condition-gather 무게) → NAS 세계 새로 시작은 사용자 결정.
- 짐꾼 걸음·노두 3D 그림·NPC 증축 건물이 실제 지도에서 보이는지는 눈으로 보지 않았다. 휴대폰 미확인.

- NAS 배포(CI 321, 2026-11-12 19:30 KST) 뒤 nas-metrics(Verified): RSS 548~564MB(메모리 57%), 루프 p99 1.0~1.4ms, DB 실패 0, 도시 49·건물 835·휴먼 1,875, 기기 오류 0. NPC 증축은 첫 세력 판단 전이라 아직 0채.

## 사용자 결정 대기
- NAS 세계 새로 시작: 사용자 답(2026-11-12) "1121 답을 기다린 뒤" — 기획이 시험 행성 산지(질문 1121)를 정하면 그 변경과 함께 새로 시작한다.
