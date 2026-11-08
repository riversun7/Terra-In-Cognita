# 묶음 합치기: 세계 배치(D-528)·공성 결과(D-527)·계산식 끌어 넣기·/dev/tuning 개편·/dev/balance 완전 개편

- 일시: 2026-11-08 22:35 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-07-world-layout.md`(D-528, 확정)·`2026-11-07-war-outcomes.md`(D-527, 확정)·`2026-11-01-formula-editor.md`(끌어 넣기, 확정)·`2026-11-01-dev-settings-panel.md`(화면 개편, 상태 그대로)·`2026-11-01-balance-screen.md`(완전 개편, 상태 그대로)

## 한 일
- 통합 가지(main c18ad1b 위)에 차례로: `work/world-placement`(fe3c4c4, 빨리감기) → `work/devtools-formula`(b718f51, 빨리감기) → `work/war-outcomes-2`(dd2e650, 빨리감기) → PWA 고침 → `work/devtools-tuning`(a8d0916, 충돌 목차) → `work/devtools-balance`(f5ed2cf, 충돌 PLAN 줄).
- PWA 고침: 세계 배치 줄기가 `scripts/pwa-build.mjs`에만 `WorldLayout`을 넣고 `apps/game/vite.config.ts` `globIgnores`에는 빠뜨려 sw.js가 개발 화면 조각을 미리 캐시했다. 또 개발 도구 셋(행성 편집기·항성계·세계 배치)이 평면 지도를 같이 쓰며 공용 조각 `generator-*`·`cellReport-*`가 생겼다. 두 목록(`globIgnores`, `DEV_ONLY_CHUNK`)과 `DEV_ONLY_SOURCE`(`worldLayout`)에 넣었다.
- 판: 프로토콜 19(최소 18) 그대로, 팩 core@57, SIM 22, 마이그레이션 둘(`20261108115023_world_placement`, `20261108124347_war_outcomes_d527`, 더하기만).
- 묶음 검사(통합 머리, 다섯 줄기를 합친 판): `pnpm check` 552파일 4,202개 통과, `check:docs`·`check:content`(core@57) 통과, 빌드·`check-pwa` 통과, 첫 화면 JS 107,175 B / 131,416 B, 화면 시험 tuning·faction·world-layout·formulas·balance·battleLab 135개 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/vite.config.ts`, `scripts/pwa-build.mjs` | 개발 화면 조각(세계 배치·공용 평면 지도 조각)을 미리 캐시에서 뺀다 |
| `docs/PLAN.md`, `docs/WORKLOG.md` | 줄기 줄을 모두 남김, 목차 |

## 함께 바꿔야 하는 파일
- 개발 화면을 새로 만들면 `vite.config.ts` `globIgnores`와 `scripts/pwa-build.mjs` `DEV_ONLY_CHUNK`·`DEV_ONLY_SOURCE` 셋을 함께 고친다(하나만 고치면 check-pwa가 실패한다).
- `apps/server/src/app.ts` 약 984줄, `db/schema.ts` 969줄 — 1,000줄 넘으면 CI 실패.

## 건드리지 말 것
- 올라간 마이그레이션.

## 미검증·TODO·알려진 문제
- 세계 배치 자리는 다음 서버 시작 때만 든다. NAS에서 국가 옮기기는 해 보지 않았다.
- 공성 결과: 유저 약탈·재건 명령 없음, 정부 무너짐 동안 세금·구인 그대로, 평화가 약탈을 끝내지 않음.
- /dev/balance 분석 결과는 서버 메모리에만(30분·20개). 비용 상한은 개발 컨테이너 잰 값.
- /dev/tuning·/dev/balance 개편은 사용자 확인 뒤 확정. 아이템·스킬·건물 편집기 화면 개편은 다음 줄기.
- 질문 850~858·860~868·875~879·880~881은 기획에 보낸다.

## 사용자 결정 대기
- /dev/tuning·/dev/balance 개편 화면 확인.
