# 묶음 합치기: 개발자 패널 분야별 페이지 + 식품 포장(D-524) + 부상·귀화(D-525·D-526)

- 일시: 2026-11-08 21:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-01-dev-settings-panel.md`(바뀜 분야별 페이지), `2026-11-03-item-holdings.md`(D-524, 확정), `2026-11-08-injury.md`(D-525, 확정), `2026-11-08-citizenship.md`(D-526, 확정)

## 한 일
- 통합 가지(main 274f4f9 위)에 차례로: `work/tuning-pages`(74aff19, 충돌 목차) → `work/food-pack`(d3c1de2, 충돌 PLAN 줄·목차) → `work/injury-citizen2`(d9c45ae — 통합 07e08fa를 먼저 합치고 끝 검사, 빨리감기) → main 문서 커밋.
- 판: 프로토콜 19(최소 18 — 포장 풀기·귀화 조건), 팩 core@56, SIM 21 그대로, 마이그레이션 둘(`20261108111527_food_pack`, `20261108112036_naturalize_terms_standing`, 모두 더하기만).
- 묶음 검사: `pnpm check` = injury-citizen2 줄기가 합친 판에서 4,115개 통과. 통합 머리에서 `check:docs`·`check:content`(core@56)·빌드·`check-pwa` 통과, 첫 화면 JS 106,977 B / 131,416 B. 화면 시험: tuning 29(tuning-pages), inventory 11(food-pack), citizenship·injury·combat-life·unit-control 23(합친 판) 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/PLAN.md`, `docs/WORKLOG.md` | 줄기 줄을 모두 남김, 목차 |

## 함께 바꿔야 하는 파일
- 새 설정 칸에는 `desc`(ko·en)·`source`를 단다(없으면 패널에 이름만 보인다). 패널 페이지는 `packages/sim/src/tuningPages.ts`.

## 건드리지 말 것
- 올라간 마이그레이션.

## 미검증·TODO·알려진 문제
- NAS의 옛 식품이 첫 부팅 때 포장 칸으로 바뀌는 것은 배포 뒤 본다(Unknown).
- 우호도는 쌓이고 보이기만 한다(효과·회복 없음). 나라 조건(입회비·지원금) 정하는 화면 없음.
- 새 설정 칸 40개(NPC 등)는 서버를 다시 켜야 든다.
- 질문 830~831·840~844·845~849는 기획에 보낸다.

## 사용자 결정 대기
- 없음.
