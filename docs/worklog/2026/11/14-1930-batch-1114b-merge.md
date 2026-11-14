# 2026-11-14 여덟째 묶음 합치기 (전투 보고서·배 B3·낚시터 물 종류·초상 2D 제거·작은 섬 지움·시험 고침)

- 일시: 2026-11-14 19:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-542, 줄기 작업 기록 `14-1537-dev-ui-fix`·`14-1620-balance-report`·`14-1630-boats-b3`·`14-1700-fish-range`·`14-1820-portrait-fix`·`14-1900-stop-detach`·`14-2110-islet-remove`, main의 `14-1825-inventory-gather-progress`(다른 세션), 새 질문 1376~1385·1396~1407·1411~1414·1421~1423

## 한 일
- 줄기 여섯을 통합 가지에 합쳤다: dev-ui-fix → balance-report → fish-range → boats-b3(통합 가지를 줄기에 합친 뒤 빨리감기) → stop-detach(빨리감기) → portrait-fix. 바탕은 main 3ed82a2 + 미러 8bccd2f(D-542).
- 그 뒤 main(다른 세션의 인벤토리·채집 진행바, b7e310c)을 합치고, 사용자 결정(2026-11-14 "모두 지우기")으로 작은 섬 지움(islet-remove)을 합쳤다.
- 버전: 팩 core@92, 프로토콜 29(최소 28) 그대로, `SIM_VERSION` 42, 시뮬 출력 형식 20. 새 마이그레이션 하나(`20261114063847_battle_reports`, 표 추가만).
- 통합 가지에서 직접 고친 시험 셋(합친 뒤 화면 시험이 찾음):
  - `e2e/battleLab.spec.ts`: 미리 보기 기대값을 D-538·D-539 규칙(맨손 공격력 = STR + ⌊VIT/2⌋, 명중 100%, 무기 공격력은 더하기)으로.
  - `e2e/dev-stagebar.spec.ts`: 지운 `/dev/balance` 가중치 탭 항목을 뺐다.
  - `e2e/tuning.spec.ts`: 단위 거르기 뒤 줄 수를 다시 그린 다음에 센다.
  - `e2e/economy.spec.ts`: 거래소 물건 수 151 → 161. D-540(8f8bda9, 여섯째 묶음)이 자연 채집물·고래 아이템 10개를 더했는데 기대값이 그대로였다(그 뒤 묶음들이 이 시험을 돌리지 않았다).
- [멈추기] 시험 시간 초과(stop-detach): 화면 결함이 아니라 시험 경쟁이었다. 느린 기계에서 `click()`의 안정 확인 사이에 유닛이 닿아 단추가 사라졌다(줄기 기록 참고, Verified: Playwright 추적). 시험만 `dispatchEvent`로 바꿨다. 앱은 그대로다.
- 손으로 푼 곳: `docs/WORKLOG.md`(다시 만듦), main 합치기의 `apps/game/messages/{ko,en}.json`(새 키 양쪽 다)·`apps/game/src/map/gather/GatherPanel.tsx`(import 둘 다).

## 리셋 필요 여부: 필요 없음
- 전투 보고서: 새 표 `battle_reports`는 비어서 시작하는 개발 도구 기록이다. 세계 새로 시작 때 남길 표에 넣었다.
- 배 B3(배에서 캐기·NPC 배·재료 돌려주기·먼 바다): 표 변경이 없다. 작업 줄 jsonb에 자리를 더 적는 것은 새 줄부터다. 옛 줄은 "위치 없음"으로 읽는다. NPC 배는 켤 때부터 부두가 생기면 만든다.
- 낚시터 물 종류: 설정 칸·규칙이라 다음 채집·다음 하루 끝부터 든다.
- 초상 2D 제거: 기기 화면만 바뀐다. 기기의 옛 한 장 초상 값도 읽는다.
- 작은 섬 지움: 지형 판 표지에 소품 규칙 해시가 들어 있어 고정본이 없는 2차맵은 켤 때 다시 만들어진다. 고정본(건물을 처음 놓은 2차맵)에는 그림 번호가 남지만 새 앱은 그리지 않는다(판정 영향 없음, islet-remove 기록).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `e2e/battleLab.spec.ts`, `e2e/dev-stagebar.spec.ts`, `e2e/tuning.spec.ts`, `e2e/economy.spec.ts` | 합친 뒤 바뀐 규칙·화면에 시험을 맞춤 |
| `docs/WORKLOG.md`, `apps/game/messages/{ko,en}.json`, `apps/game/src/map/gather/GatherPanel.tsx` | 합치기 충돌 |

## 함께 바꿔야 하는 파일
- 프로토콜을 올리면 최소 판 = 지금 − 1(프로토콜 시험이 본다).
- `apps/server/src/world/world.ts` 998줄, `secondMap.ts` 969줄 근처 — 더할 것은 새 모듈로.
- 세계 밖 표를 더하면 `apps/server/src/cli/resetWorld.ts` 남길 표 목록에 넣는다(`battle_reports`는 넣었다).

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션 `20261114063847_battle_reports`.

## 미검증·TODO·알려진 문제
- 검사(Verified)
  - 통합 가지 7906f49(초상·[멈추기] 시험 고침 전): `pnpm check`·`check:docs`·`check:content`(core@91)·빌드·`check-pwa`·`check:bundle` 통과.
  - 통합 가지 14e1526(여섯 줄기 모두): 빌드·`check-pwa`·`check:bundle`(첫 화면 109,203 B / 131,416 B) 통과. `pnpm check`는 main 푸시 전 훅에서 돈다.
  - 화면 시험(14e1526): boats·play-map·cyborg·first-login·character-3d·map-input 68 통과·1 실패·2 건너뜀(측정 전용), unit-control 21/21 통과.
  - 실패 하나는 배 시험 다크(`boats.spec.ts:227`)다. 실패 기록은 다음 시험이 결과 폴더를 비워 남지 않았다. 배 시험만 다시 돌리자 2/2 통과했다. 기계 부하 탓의 흔들림으로 본다(Assumed: 원인을 보지 못함, stop-detach 줄기 통합 실행에서도 배 시험은 통과).
  - 그 전 7906f49 화면 시험(battleLab·dev-stagebar·tuning 등)은 시험 셋을 고친 뒤 통과했다.
  - main 합친 뒤 8a73ecb: `pnpm check` 통과, 빌드·`check-pwa`·`check:bundle`(109,654 B) 통과. 화면 시험 gather·inventory·map-hud·economy·boats·cyborg·character-3d·gather-station 80 통과·1 실패(경제 물건 수, 위 고침)·2 건너뜀, unit-control·play-map 44/44 통과. economy만 다시: 24 통과·1 실패(같은 것) → 고침.
  - 작은 섬 지움 줄기: `pnpm check` 693 파일·5,229 시험, 빌드·묶음, map-props·terrain-objects 13 통과(줄기 기록).
- 전투 보고서 1,000판 23초는 개발 컨테이너 값이다. NAS 값은 Unknown.
- 배 B3 NPC 배: 측정한 세계에 부두가 0개라 NPC 배가 실제로 돈 것은 보지 못했다(boats-b3 기록).
- 휴대폰에서 보지 않았다(전투 보고서·초상).
- 기획 42 지형별 오브젝트 표에는 호수 "작은 섬"이 남아 있다(원본은 기획 세션 몫).

## 사용자 결정 대기
- 기획 질문 1376~1385(전투 보고서·겹침 조사: `/dev/battle-replay`·`battleLab.monteCarlo` 지우기 등), 1396~1407(배 B3), 1411~1414(낚시터 물 종류), 1421~1423(초상) — 기획 세션에 보낸다. 작은 섬 지움은 사용자 결정이라 질문 없음.
