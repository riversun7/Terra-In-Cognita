# 누르는 곳 최소 크기 규칙 풀기(44px → 24px), 작은 단추 38px로 되돌림

- 일시: 2026-11-21 20:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-tap-target-relax.md`(새로 씀), `2026-10-28-design-system.md`·`2026-10-29-app-shell.md`(상태 줄에 "일부 대체됨"), 작업 기록 `21-2000-e2e-tap-size-peek-line.md`

## 한 일

사용자 답(2026-11-21): "일단 마음대로 빠르게만 진행해라. 그런데 디자인 규칙을 바꿔라 왜 그렇게 엄격한 제한을 두는가."

- **최소 크기 규칙**: 누르는 곳 최소 크기를 WCAG 2.2 AA(2.5.8) 기준인 24px로 풀었다. 새 토큰은 `--tap-min`이다.
- **권장 크기**: `--tap-size`(44px)는 권장 크기·배치 값으로 남긴다.
- **작은 단추**: `--control-h-sm`을 38px로 되돌렸다(Antigravity 값). 직전 작업에서 44px로 올렸던 것을 다시 내린 것이다.
- **화면 시험 도우미**: `smallTapTargets`가 기본으로 `--tap-min`을 읽는다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css` | `--control-h-sm` 38px, `--tap-min` 24px 새 토큰 |
| `apps/game/src/styles.css` | 작은 단추·글자 단추 주석(44px → `--tap-min`) |
| `e2e/helpers/screen.ts` | 시험 기준 `--tap-min`, 읽지 못할 때 24 |
| `docs/adr/2026-11-21-tap-target-relax.md`(새)·`2026-10-28-design-system.md`·`2026-10-29-app-shell.md` | 결정 기록, 옛 ADR 상태 줄 |

## 함께 바꿔야 하는 파일

- 최소 크기를 다시 바꾸면 `tokens.css` `--tap-min`과 `e2e/helpers/screen.ts` `TAP_SIZE_FALLBACK`을 같이 바꾼다.

## 건드리지 말 것

- 없음.

## 뒤이어 바꾼 것(같은 날, 사용자 답 "ㅇㅇ")

- `e2e/tuning.spec.ts`: 설정 칸 패널 휴대폰 화면도 `min: 44`를 빼고 `--tap-min`(24px)으로 본다. `--dev-touch-tap`(44px) 토큰과 화면 모양은 그대로다(ADR 바뀜 절).

## 미검증·TODO·알려진 문제

- 화면 시험은 다시 돌리지 않았다.
  - 기준이 44에서 24로 낮아졌을 뿐이라, 44로 통과하던 것은 24로도 통과한다(Assumed, 논리상).
  - 38px 단추로 돌아간 화면의 가로 넘침은 Antigravity 작업 때 그 값으로 확인했다고 적혀 있다(그 작업 기록).
