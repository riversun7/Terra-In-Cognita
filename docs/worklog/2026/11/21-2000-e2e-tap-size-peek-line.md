# 화면 시험 실패 고치기: 작은 단추 38px → 44px, 작은 창 첫 줄 선택자

- 일시: 2026-11-21 20:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-28-design-system.md`(조작부 44px), 작업 기록 `19-0045-theme-and-home-cards.md`(토큰 정돈)·`21-1800-grey-maps-enter-messages.md`(실패를 처음 적음)

## 한 일

사용자 요청(2026-11-21): 이 세션에서 "Fix e2e failures from 38px buttons and peek line"을 진행.

- **작은 단추 높이**: `--control-h-sm`을 38px에서 44px로 되돌렸다.
  - 커밋 `65ca9594`(테마·홈 카드 정돈)가 44px을 38px로 낮췄다. `--control-h`도 52px에서 46px로 낮췄다.
  - 그 작업 기록에는 색·배경 토큰만 적혀 있어, 이 변경이 의도였다는 기록이 없다.
  - 디자인 시스템 ADR은 "조작부 44px"이고, `styles.css` `.button-small` 주석도 "누르는 영역은 그대로 44px"이다. 그래서 작은 단추만 되돌렸다.
  - `--control-h`(46px)는 44px보다 커서 그대로 둔다.
  - 그 결과 `smallTapTargets` 검사가 [뒤로]·[닫기]·[멈추기]·[10개 더 보기]·[운영]·[이 유닛 조종]을 38px로 잡던 실패가 없어진다.
- **남의 유닛 작은 창**: 주인·가문 줄(`map-peek-line map-peek-owner`)이 더해져 `.map-peek-line`이 둘이 됐다. 그래서 Playwright strict 위반이 났다.
  - 시험이 첫 줄(`.map-peek-line:not(.map-peek-owner)`)을 보게 바꿨다(`unit-control.spec.ts`·`control-move3.spec.ts`).

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css` | `--control-h-sm` 44px(누르는 곳 최소 크기) |
| `e2e/unit-control.spec.ts`·`e2e/control-move3.spec.ts` | 작은 창 첫 줄 선택자 |

## 함께 바꿔야 하는 파일

- 조작부 토큰을 바꾸면 `e2e/helpers/screen.ts` `smallTapTargets`(기본 `--tap-size`)가 잡는지 본다.

## 건드리지 말 것

- `--tap-size`(44px)와 ADR의 44px 규칙. 단추를 작게 보이게 하려면 누르는 상자는 그대로 두고 안쪽 모양만 줄인다.

## 미검증·TODO·알려진 문제

- 홈 대시보드 작은 단추가 6px 커진다. 홈 화면 사진은 찍지 않았다.
- 다른 화면 시험(홈·설정 등)은 다시 돌리지 않았다. 작은 단추가 커져 가로 넘침이 생기는지는 미검증이다.

## 사용자 결정 대기

- 홈 대시보드를 낮은 단추(38px)로 보이게 하고 싶다면 알려 주세요. 누르는 상자는 44px로 두고 겉모양만 줄이는 방법이 있습니다.

## 검사
- 화면 시험(Playwright, 헤드리스, Verified): `unit-control.spec.ts`·`control-move3.spec.ts` 27개 모두 통과(12.5분).
