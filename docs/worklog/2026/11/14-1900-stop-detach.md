# 화면 시험 [멈추기] 누르기 시간 초과 고침(unit-control)

- 일시: 2026-11-14 18:30 ~ 19:30 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/stop-detach`(통합 7906f49 위), 앞 기록 `docs/worklog/2026/11/09-1945-stop-flicker.md`, `docs/worklog/2026/11/14-1630-boats-b3.md`

## 한 일
- 통합 가지에서 `e2e/unit-control.spec.ts` :215("…[멈추기]로 세운다")·:285("남의 유닛을 누르면 정보 판…")이 `.map-unit-stop` 누르기에서 120초 시간 초과로 실패했다.
- 원인(Verified: 다시 돌린 실행의 trace): 두 시험 모두 단추 수를 센 뒤(또는 보인 뒤) `click()`을 부르는데, 그 사이 내 사이보그가 목적지에 닿아 단추가 사라졌다
  (단추는 움직이는 동안만 보이는 것이 설계다). `click()`은 시간 제한이 없어 시험 시간 끝까지 단추를 기다렸다. trace: 보임 확인 47.6초 → 수 세기 50.5초(1) → 누르기
  51.3초에 이미 없음. 단추를 찾은 직후 사라지면 Playwright 기록에 "element was detached from the DOM, retrying"이 남는다(통합 실행에서 본 기록과 같은 꼴).
  - 혼자 돌리면 통과했다(Verified: 같은 가지, :215만 1 통과). 묶어 돌리면(기계 부하 — 사진 찍기가 약 3초) 실패했다(Verified: 21개 가운데 :215만 실패).
  - 배 B3 코드가 원인이 아니다(Verified: 코드 — 통합 뒤 바뀐 2차맵·화면 코드는 B3의 봇 승객 가드·배 채집 판 칸뿐이고, 사이보그 이동·[멈추기] 조건
    (`anchorUnit.ts showStop`·`heldMoving`)·화면 바닥 줄 구조는 그대로다). 단추가 다시 그려지며 바뀌는 것(key·요소 종류)도 없다.
  - 처음 고침(click 3초 × 세 번)도 묶음 실행에서 실패했다(Verified: trace). 단추가 있어도 Playwright의 클릭 동작 검사(멈춰 있음·가리지 않음)가 헤드리스 소프트웨어
    WebGL(프레임 몇 장/초)에서 3초를 넘기고, 그사이 바닥 줄이 다시 놓여 "element is not stable" → "element was detached from the DOM, retrying"이 되풀이됐다.
    통합 실행에서 본 120초 "detached" 되풀이도 이 꼴이다(Assumed: 그 실행 기록은 보지 않았다). 같은 시험이 이전 묶음에서 통과한 것은 기계 부하 차이로 본다(Assumed —
    여러 줄기가 한 기계에서 화면 시험·빌드를 돌린다).
- 고침(시험만): :215는 단추에 클릭 이벤트를 바로 보낸다(`dispatchEvent("click")`, 붙어 있을 때만, 3초) — 세 번까지, 그 전에 닿아 단추가 없으면 다시 보낸다. 단추의
  눌림 처리(멈추기 명령)는 그대로 시험한다. :285와 `e2e/map-input.spec.ts`의 마무리 세우기도 같은 방식 + 5초 제한, 실패는 넘긴다(다른 마무리 세우기 :495·:584와 같은 꼴).
- 앱 코드는 바꾸지 않았다: 단추는 움직이는 동안 같은 DOM 요소로 남는다(React 위치·종류가 바뀌지 않음 — Verified: 코드), 닿으면 사라지는 것이 설계다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/unit-control.spec.ts` | 닿아서 사라진 [멈추기]를 끝없이 기다리지 않게 |
| `e2e/map-input.spec.ts` | 같은 꼴의 마무리 세우기 |

## 함께 바꿔야 하는 파일
- 없음. [멈추기]를 누르는 새 시험은 `click({ timeout })`으로 누르고, 사라지면 다시 보낸다.

## 건드리지 말 것
- [멈추기] 보이기 규칙(`showStop`·`heldMoving`, stop-flicker)은 그대로다.

## 미검증·TODO·알려진 문제
- 통합 실행에서 120초 동안 "detached" 기록이 되풀이된 것은 그 실행 기록을 보지 못해 되풀이까지 같은지는 Assumed(같은 경쟁이 다시 보내기 없이 이어진 것으로 본다).

## 검사 (Verified: 실행)
- 고치기 전(통합 7906f49): `unit-control.spec.ts` :215만 혼자 1 통과, 전체 21개 중 :215 실패(누르기 전에 닿음).
- 처음 고침(click 3초): `unit-control boats play-map` 묶음 45 통과·1 실패(:215 — not stable·detached, 위 설명). 배·play-map은 모두 통과.
- 지금 고침(dispatchEvent): `unit-control.spec.ts` 전체 21 통과(18.3분).
- `pnpm check`(TEST_DATABASE_URL 포함): 693 파일 5,226 시험 통과.

## 사용자 결정 대기
- 없음
