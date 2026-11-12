# 2026-11-12 성향 칸 바닥 12 (사이보그 생성 굴리기)

- 일시: 2026-11-12 12:40 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 지시 2026-11-12(생성 화면 사진, 기술 성향인데 DEX 10) "스탯 편향을 선택해도 전혀 높지 않은것도 나온다 선택된 둘다 12이상으로 나오던지하게해라", ADR `2026-11-01-first-login-cyborg.md` "바뀜 (2026-11-12, 성향 칸 바닥)"

## 한 일
- 성향(전투·기술·교역)을 고르면 그 두 스탯이 바닥값 아래로 나오지 않게 했다. 바닥은 새 설정 칸 `n9_initial_favor_floor`(출발값 12, 1~20). 균형 성향은 바닥이 없다.
- 굴림(성향 평균 + 정규분포)은 그대로다. 합 60을 맞출 때 성향 칸의 최소를 바닥으로 두어, 바닥까지 올린 만큼 나머지 네 칸에서 무게 비례로 덜어 낸다. 생성과 환생이 같은 함수를 쓴다.
- 서버는 설정 칸을 바로 읽는다(`tuning/scope.ts` 서버 경로에 더함). 팩 core@75.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/cyborgStats.ts` | 합 맞추기에 칸마다 최소(성향 칸 = 바닥) |
| `packages/sim/src/society/coefficients.ts`, `packages/sim/src/tuningCyborg.ts`, `apps/server/src/tuning/scope.ts` | 새 설정 칸 `cyborg.initialFavorFloor` |
| `content/core/tuning.json`, `content/core/manifest.json` | 칸 값 12, core@75 |
| `packages/sim/src/society/cyborgStats.test.ts` | 성향 세 개 × 시드 500개에서 두 칸 ≥ 12·합 60, 바닥 15로 바꾸면 따름, 모두 낮게 굴리면 성향 칸 12·나머지 9 |
| `docs/adr/2026-11-01-first-login-cyborg.md` | 바뀜 절 |

## 함께 바꿔야 하는 파일
- 굴리기 규칙은 `cyborgStats.ts` 하나다(생성 `cyborg/service.ts`, 환생 화면이 함께 쓴다).

## 건드리지 말 것
- 없음.

## 미검증·TODO·알려진 문제
- 시험(Verified): sim `cyborgStats`·`tuning` 49개, 서버 `tuning`·`cyborg` 34개 통과(DB 시험 23개는 이 실행에서 건너뜀). 전체 검사는 main 푸시 전 훅.
- 화면에서 굴려 보지 않았다(휴대폰 미확인).

## 사용자 결정 대기
- 없음.
