# 2026-11-14 여덟째 묶음 합치기 (전투 보고서·배 B3·낚시터 물 종류·초상 2D 제거·시험 고침)

- 일시: 2026-11-14 19:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-542, 줄기 작업 기록 `14-1537-dev-ui-fix`·`14-1620-balance-report`·`14-1630-boats-b3`·`14-1700-fish-range`·`14-1820-portrait-fix`·`14-1900-stop-detach`, 새 질문 1376~1385·1396~1407·1411~1414·1421~1423

## 한 일
- 줄기 여섯을 통합 가지에 합쳤다: dev-ui-fix → balance-report → fish-range → boats-b3(통합 가지를 줄기에 합친 뒤 빨리감기) → stop-detach(빨리감기) → portrait-fix. 바탕은 main 3ed82a2 + 미러 8bccd2f(D-542).
- 버전: 팩 core@91, 프로토콜 29(최소 28) 그대로, `SIM_VERSION` 42, 시뮬 출력 형식 20. 새 마이그레이션 하나(`20261114063847_battle_reports`, 표 추가만).
- 통합 가지에서 직접 고친 시험 셋(합친 뒤 화면 시험이 찾음):
  - `e2e/battleLab.spec.ts`: 미리 보기 기대값을 D-538·D-539 규칙(맨손 공격력 = STR + ⌊VIT/2⌋, 명중 100%, 무기 공격력은 더하기)으로.
  - `e2e/dev-stagebar.spec.ts`: 지운 `/dev/balance` 가중치 탭 항목을 뺐다.
  - `e2e/tuning.spec.ts`: 단위 거르기 뒤 줄 수를 다시 그린 다음에 센다.
- [멈추기] 시험 시간 초과(stop-detach): 화면 결함이 아니라 시험 경쟁이었다. 느린 기계에서 `click()`의 안정 확인 사이에 유닛이 닿아 단추가 사라졌다(줄기 기록 참고, Verified: Playwright 추적). 시험만 `dispatchEvent`로 바꿨다. 앱은 그대로다.
- 손으로 푼 곳: `docs/WORKLOG.md`(다시 만듦).

## 리셋 필요 여부: 필요 없음
- 전투 보고서: 새 표 `battle_reports`는 비어서 시작하는 개발 도구 기록이다. 세계 새로 시작 때 남길 표에 넣었다.
- 배 B3(배에서 캐기·NPC 배·재료 돌려주기·먼 바다): 표 변경이 없다. 작업 줄 jsonb에 자리를 더 적는 것은 새 줄부터다. 옛 줄은 "위치 없음"으로 읽는다. NPC 배는 켤 때부터 부두가 생기면 만든다.
- 낚시터 물 종류: 설정 칸·규칙이라 다음 채집·다음 하루 끝부터 든다.
- 초상 2D 제거: 기기 화면만 바뀐다. 기기의 옛 한 장 초상 값도 읽는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/battleLab.spec.ts`, `e2e/dev-stagebar.spec.ts`, `e2e/tuning.spec.ts` | 합친 뒤 바뀐 규칙·화면에 시험을 맞춤 |
| `docs/WORKLOG.md` | 합치기 충돌 |

## 함께 바꿔야 하는 파일
- 프로토콜을 올리면 최소 판 = 지금 − 1(프로토콜 시험이 본다).
- `apps/server/src/world/world.ts` 998줄, `secondMap.ts` 969줄 근처 — 더할 것은 새 모듈로.
- 세계 밖 표를 더하면 `apps/server/src/cli/resetWorld.ts` 남길 표 목록에 넣는다(`battle_reports`는 넣었다).

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션 `20261114063847_battle_reports`.

## 미검증·TODO·알려진 문제
- 검사: 아래 "검사" 칸에 적는다.
- 전투 보고서 1,000판 23초는 개발 컨테이너 값이다. NAS 값은 Unknown.
- 배 B3 NPC 배: 측정한 세계에 부두가 0개라 NPC 배가 실제로 돈 것은 보지 못했다(boats-b3 기록).
- 휴대폰에서 보지 않았다(전투 보고서·초상).
- `map-input.spec.ts`의 [멈추기] 정리 한 줄은 이 묶음 화면 시험에서 처음 돈다.

## 사용자 결정 대기
- 기획 질문 1376~1385(전투 보고서·겹침 조사: `/dev/battle-replay`·`battleLab.monteCarlo` 지우기 등), 1396~1407(배 B3), 1411~1414(낚시터 물 종류), 1421~1423(초상) — 기획 세션에 보낸다.
