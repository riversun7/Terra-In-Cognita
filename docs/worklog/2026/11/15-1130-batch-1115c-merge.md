# 2026-11-15 열한째 묶음 합치기 (배 체계 개편·파티·군단 명령·채집 오브젝트 티어 범위·2차 스탯 식 글·미러 D-559)

- 일시: 2026-11-15 11:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-547·D-549·D-552·D-556(구현), 미러 D-550~D-559, 줄기 작업 기록 `14-2330-legion-commands`·`15-0940-boats-impl`·`15-1010-gather-objects-2`·`15-1050-stat-formula-text`, 질문 1521~1540·1616~1620(배), 1541~1548(군단), 1561~1569(채집), 1611~1613(식 글)

## 한 일
- 줄기 넷을 통합 가지에 합쳤다(바탕 main 05012e5 + 미러 D-547~D-549 커밋들): legion-commands → boats-impl → gather-objects-2 → stat-formula-text.
  - legion-commands(D-549): 파티·군단 명령(`packages/sim/src/combat/orders.ts`), 지휘 정원 밖 파티는 군단 명령을 받지 않음, 2차맵·전투맵 걸음 AGI(`apps/server/src/world/walkSpeed.ts`).
  - boats-impl(D-547): 조선소·정박장·교역 부두 나눔(`apps/server/src/boats/`), 정박 화면(`HarborPanel.tsx`), 새 마이그레이션 `20261115000251_boats_harbor`(표 추가만), 켤 때 한 번 옛 배·부두를 지움(1499).
  - gather-objects-2(D-552·D-556): 티어 = 채집자 스탯 표 하나 + 오브젝트마다 티어 범위, 오브젝트 편집기 `/dev/gather-objects`, `wild_goods` 분류 없앰.
  - stat-formula-text(D-556·질문 1253): 식을 글로 바꾸는 `@terra/shared/formulaText`, 2차 스탯 페이지·사이보그 판에 식 줄, "식의 가중치"와 "이 분포에서의 기여 몫"을 나눔, tRPC `RosterCombat.formulas`(선택 칸) 추가.
- 기획 미러 77ff7ff(D-550~D-559)·0ec1e81(D-560) 동기화. README·PLAN §14 머리 문장 갱신.
- 버전: 팩 core@98, 프로토콜 30(최소 29), `SIM_VERSION` 45.
- 배 질문 번호 1541~1545가 군단 질문과 겹쳐 1616~1620으로 바꿨다(질문 문서·ADR 둘·줄기 기록).
- 손으로 푼 곳: `docs/WORKLOG.md`(다시 만듦), 메시지 파일(양쪽 키 다), 버전 주석·상수.

## 리셋 필요 여부: 필요 없음 — 배·부두만 지움(1499)
- 배 개편: 사용자 답 1499 "배·부두만 지움"대로 새 판 서버가 켤 때 한 번(`boat_resets` 표지로 멱등) 옛 배·부두·조선소 작업 줄만 지운다. 승객은 배 둘레 땅에 내리고, 부두 창고 물건은 주인 도시 창고로, 돈은 주인 지갑으로 옮긴다. 세계 생성 때 정한 것(행성·도시·국가·지형)은 그대로다. 세계 리셋이 아니다.
- 파티·군단 명령: 표 변경 없음. SIM 44부터 새로 시작하는 세계 전투는 AGI 걸음이 들어가 옛 판과 결과가 다르다(진행 중 전투는 저장된 시작 자료로 이어짐).
- 채집 티어 범위: 다음 굴림부터 든다. 표 변경 없음.
- 식 글: 화면·조회 응답만 바뀐다. 수치 그대로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `docs/WORKLOG.md`, `apps/game/messages/{ko,en}.json` | 합치기 충돌 |
| `docs/design/*`, `docs/design/README.md`, `docs/PLAN.md`, `docs/worklog/2026/10/31-0910-design-mirror-aadab42.md` | 미러 D-550~D-559 |
| `docs/questions/2026-11-14-boats-impl.md`, `docs/adr/2026-11-15-sea-combat-routes.md`, `docs/adr/2026-11-15-shipyard-harbor.md`, `docs/worklog/2026/11/15-0940-boats-impl.md` | 배 질문 번호 1541~1545 → 1616~1620 |

## 함께 바꿔야 하는 파일
- `apps/server/src/app.ts` 999줄(상한 1,000) — 더할 것은 새 모듈로.
- 프로토콜을 올리면 최소 판 = 지금 − 1.

## 건드리지 말 것
- 이번에 main에 오르는 마이그레이션 `20261115000251_boats_harbor`.

## 미검증·TODO·알려진 문제
- 검사(Verified)
  - 통합 가지 e0e181e(줄기 셋): `pnpm check` 714 파일·5,365 시험 통과.
  - stat-formula-text 줄기: `pnpm check` 714 파일·5,377 시험, 빌드·`check-pwa`·`check:bundle`(109,722 B / 131,416 B), 화면 시험 secondaryStats 7/7·cyborg 22/22(줄기 기록).
  - 합친 뒤 묶음 화면 시험: 아래 "묶음 시험" 덧붙임.
- D-559(배 구현 1차 답)와 지금 구현이 다른 곳: 다 만든 배는 조선소 도크에 그대로 있어야 한다(지금은 조선소 옆 물에 뜬다), 남의 배는 장기 보관료를 정산해야 출고, 모듈은 레벨마다 하나씩, 요금은 그 항구 나라 화폐, 정지 기준 30%. 다음 줄기(boats-2)에서 고친다.
- NAS 세계의 옛 배·부두 수는 Unknown — 배포 뒤 서버 기록 "boat reset: legacy boats and docks removed"로 본다.
- 식 글: 맨손 크리 결과 줄("AGI(14) + DEX(10) = 24‰")은 줄기 전부터 손으로 쓴 것이라 식을 바꾸면 따라가지 않는다(stat-formula-text 기록).
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 1561~1569(채집 오브젝트), 1611~1613(식 글) — 기획 세션에 보낸다. 배 1525·1526·1528~1540·1616~1620 중 D-559에 답이 없는 것은 기획 세션이 묻는 중.
