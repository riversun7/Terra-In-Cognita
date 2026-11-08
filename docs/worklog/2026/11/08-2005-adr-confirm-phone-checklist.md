# ADR 10개 확정 표시, 휴대폰 확인표

- 일시: 2026-11-08 20:05 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 결정 2026-11-08(진행상황 세션 ADR 검토), `docs/checklists/2026-11-08-phone-check.md`

## 한 일
- 사용자가 확정하기로 한 ADR 10개의 상태 줄만 "확정 (2026-11-08, 사용자 결정 — 진행상황 세션 ADR 검토)"으로 바꿨다. 본문은 고치지 않았다. 앞 상태 줄의 메모 중 쓸모 있는 것만 짧게 남겼다.
- 사용자가 휴대폰으로 직접 볼 ADR 8개의 확인표를 만들었다(`docs/checklists/`, 새 폴더). 각 ADR의 확정 조건·다시 볼 조건·측정 항목과 지금 주소 표(`packages/shared/src/routes.ts`)·화면 문구(`apps/game/messages/ko.json`)·지도 숫자 판(`apps/game/src/map/MapPerfPanel.tsx`, `PlanetMapScreen.tsx`)을 보고 항목을 적었다.
  - 지도 숫자 판은 따로 켜는 주소 없이 늘 보인다(Verified: 코드). `?perf=1` 같은 주소는 없다.
  - S1 봇 1,000개 화면은 시험 2차맵 키(`S1_TEST_MAP_KEY` = 312905547382793, `packages/protocol/src/secondMap.ts`) + [운영자 모드]로 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/adr/2026-10-31-rules-simulator.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-31-economy-core.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-31-combat-core.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-31-faction-society-core.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-11-01-npc-brain-r5.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-11-01-gardener-r5b.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-29-combat-map-instances.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-29-generator-variety.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-31-s3-server-stage.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/adr/2026-10-31-second-map-from-planet.md` | 상태 줄 → 확정(사용자 결정) |
| `docs/checklists/2026-11-08-phone-check.md` | 새 파일: 휴대폰 확인표(ADR 8개) |
| `docs/worklog/2026/11/08-2005-adr-confirm-phone-checklist.md` | 이 작업 기록 |
| `docs/WORKLOG.md` | 목차 다시 만듦(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- 없음. 다만 아래 "미검증·TODO"의 두 ADR 표시는 지시 범위 밖이라 하지 않았다.

## 건드리지 말 것
- `2026-10-31-space-layer-data-model.md`: 사용자가 미루기로 했다(D-372). 제안 그대로.
- `2026-11-03-item-holdings.md`: 사용자가 규칙을 바꿨다("음식은 포장된것만 스택. 포장 해제시 신선도 하락시작"). 기획 D-ID를 기다린다. 제안 그대로.
- 확정한 10개 ADR의 본문. 바꿀 것은 새 ADR로 쓴다(PROTECTED).

## 미검증·TODO·알려진 문제
- `2026-10-31-economy-core.md` 5절은 "이 ADR을 확정할 때 ADR 8(`2026-10-28-economy-ledger.md`) 상태에 '일부 대체됨' 표시"라고 적었다. 이번 지시가 다른 ADR을 고치지 말라고 해서 하지 않았다. 다음 문서 작업에서 ADR 8 상태 줄에 "일부 대체됨: 2026-10-31-economy-core.md — 주문 응답 목표를 장비별로"를 더한다.
- `2026-10-29-combat-map-instances.md` 관련 줄은 "ADR 5(`2026-10-28-simulation-model.md`)의 '전투' 줄을 확정 때 대체"라고 적었다. 같은 이유로 ADR 5에 "일부 대체됨" 표시를 하지 않았다.
- 확인표 항목은 코드·문구로 맞춘 것이다. 휴대폰에서 눌러 보지 않았다(미실행). 특히 S1 시험 2차맵을 [운영자 모드]로 여는 길, 항성계 [새 항성계] → [만들기] 차례는 화면에서 확인하지 않았다(Assumed).

## 사용자 결정 대기
- 휴대폰 확인표 8개 결과를 받으면 각 ADR 상태를 확정으로 바꾼다.
