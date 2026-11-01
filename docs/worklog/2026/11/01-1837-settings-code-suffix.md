# 49 설정 칸 코드에 끼운 칸(C16a) 받기, 미러 8e7716c

- 일시: 2026-11-01 18:37 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-468(새 설정 칸 49 C16a), D-462(설정 칸 목록), ADR `2026-11-01-dev-settings-panel.md`

## 한 일
- 기획 미러를 원본 8e7716c(D-468)로 맞췄다. 49에 새 칸 C16a(웨이브 결과 목표)가 생겼다.
- `pnpm settings:cells`가 C16a를 빠뜨렸다: 코드 형식이 "대문자 + 숫자 1~2자리"뿐이었다. 기존 칸 사이에 끼운 칸(끝에 소문자 하나)도 받게 세 곳을 고쳤다. 목록 279 → 280칸.
- 시험을 먼저 쓰고(실패 확인) 고쳤다: C16a는 받고 C16ab는 받지 않는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `scripts/build-settings-cells.mjs` | 49 칸 표에서 C16a 같은 코드를 읽는다 |
| `packages/content/src/schema/tuning.ts` | 팩 설정 칸의 `code`에 C16a를 쓸 수 있게(R5b가 C16a 칸을 팩에 더함) |
| `packages/content/src/tuningDiff.ts` | 패널 내보내기 차이에도 같은 형식 |
| `scripts/build-settings-cells.test.mjs`, `packages/content/src/tuningDiff.test.ts` | 끼운 칸 시험 |
| `apps/game/src/editor/tuning/settingsCells.json` | 다시 만든 목록(C16a 포함) |
| `docs/design/**`, `docs/PLAN.md`, 미러 작업 기록 | 미러 8e7716c, 14장 상태 줄(240 답) |

## 함께 바꿔야 하는 파일
- 49 코드 형식을 또 바꾸면 위 세 정규식을 함께 바꾼다.

## 건드리지 말 것
- `docs/design/` 내용(복사본).

## 미검증·TODO·알려진 문제
- C16a를 읽는 팩 칸·시뮬 맞춤은 `work/r5b`가 한다(D-468).

## 사용자 결정 대기
- 없음.
