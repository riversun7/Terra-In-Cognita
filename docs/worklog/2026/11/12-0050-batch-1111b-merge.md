# 2026-11-11 둘째 묶음 합치기 (외형 다시 고르기·가문 창설·가문 가입·2차맵 6단계·생성 개선·2차맵 소품)

- 일시: 2026-11-12 00:50 (KST)
- 작업 도구: Claude Code
- 관련: 줄기 작업 기록 `11-2010-character-3d-2`·`11-2030-faction-identity-2`·`11-2200-house-2`·`11-2157-map-zoom-close`·`11-2308-creation-tweaks`·`11-2330-map-props-rich`, 기획 D-216·D-523·D-529·D-532

## 한 일
- 통합 가지에 줄기 여섯을 합쳤다: character-3d-2 → faction-identity-2 → house-2 → map-zoom-close → creation-tweaks → map-props-rich, 그리고 main(NAS 국가 16개).
- 버전 접기: 프로토콜 22는 character-3d-2(`cyborg_look`)와 faction-identity-2(`house_found`)가 같이 써서 한 판으로 합쳤고 house-2가 23(최소 22). 팩은 줄기마다 65·66을 올려 합칠 때 core@68까지 올렸다.
- 미러를 `e6443de`(D-532)까지 맞추고 `pnpm settings:cells`를 다시 돌렸다. NAS 국가 16개 실측을 `11-2150-nas-16-nations.md`에 덧붙였다.
- `e2e/government.spec.ts`: 지도자 이름표를 찾을 때 휠 대신 확대 사다리 [−]를 쓴다(2차맵 6단계 진입 15m에서 휠이 한 단계만 가는 때가 있어 지도자가 화면에 들지 않았다). 게임 동작은 그대로다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/protocol/src/version.ts` | 22판 설명 합침 |
| `content/core/manifest.json` | core@68 |
| `e2e/government.spec.ts` | 2차맵 6단계에 맞춘 시험 |
| `docs/design/*`, `docs/PLAN.md`, `apps/game/src/editor/tuning/settingsCells.json` | 미러 e6443de |

## 함께 바꿔야 하는 파일
- 같은 프로토콜 판을 두 줄기가 쓰면 `version.ts` 설명을 한 판에 모은다.

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션(`20261111111249_houses`, `20261111123705_house_membership`).

## 미검증·TODO·알려진 문제
- 검사(통합 가지, Verified): `pnpm check` 4,784 시험 통과, 빌드·`check-pwa`·`check:bundle`(108,780 B / 131,416 B) 통과. 화면 시험 17종: 172 통과·7 실패·2 건너뜀 → 실패 원인
  - `government` 4: 위 시험 고침 뒤 파일 전체 9/9 통과.
  - `unit-control` 1(멈추기 단추가 누르는 순간 다시 그려짐): 따로 다시 돌려 통과(흔들림으로 봄, Assumed).
  - `units` 2(플레이어 유닛 0을 기대했는데 1): 그 파일만 돌리면 13/13 통과. 앞서 도는 `unit-control`이 같은 플레이어에게 유닛을 남기는 시험 순서 문제(Assumed, 이번 묶음 전부터).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 없음. 다음 묶음: city-spacing(새 배치는 세계 새로 시작 뒤에만 든다 — 질문 1026, 사용자 결정), house-3.
