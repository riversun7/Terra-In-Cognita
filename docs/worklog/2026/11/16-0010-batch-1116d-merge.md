# 2026-11-16 묶음 1116d 합치기 (사업장 2 — D-564)

- 일시: 2026-11-16 00:10 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-564(1623·1624·1627·1628·1631·1663·1682), 줄기 작업 기록 `15-2350-business-2`, 질문 1781~1790

## 한 일
- `work/business-2`(930fcc4)를 통합 가지(main d5c2b51 + 배포 기록 c3cf6a0)에 합쳤다(385bf01). 충돌은 `docs/WORKLOG.md`만(받은 쪽 → `pnpm docs:index`).
- 줄기 내용: 지급준비금(정산 때 다음 임금·30일분 보증금 × 상승 여유 × 주인 비율을 남김), 주인이 정한 판매가(주인도 그 값), 거래소 반입 규칙을 걸 자리(`market/exchangeStock.ts`), 임금은 유닛 지갑(D-097·D-127), 운영자 건설은 재료·시간만 없애고 땅 규칙은 본다(1663), 남의 공방 장비 수리 외주(요금 = 재료 기준 값 × 20%, 공방 금고).
- 버전: 프로토콜 40(최소 39), 팩 core@108, SIM 그대로 52.

## 리셋 필요 여부: 필요 없음
- 마이그레이션 `20261115132252_business_reserve`(열 추가, null = 기본값). 직전 판 앱이 그대로 돈다.
- 배포 뒤 첫 정산부터 임금형 계약이 있는 사업장은 지급준비금만큼 덜 나눈다(의도, D-564).

## 함께 바꿔야 하는 파일
- 마이그레이션 갈래: `business_reserve`와 `unit_motion_speed`가 같은 부모(`business_shares`·`boats_dock_fuel`)에서 갈라졌다. 합친 뒤 `db:generate`는 "No schema changes"(Verified). 다음 마이그레이션의 `prevIds`에는 두 끝을 모두 적는다.
- `apps/server/src/facilities/service.ts`는 타입을 `serviceTypes.ts`로 나눠 959줄.

## 미검증·TODO·알려진 문제
- 줄기 검사(Verified, 줄기 기록): `pnpm check` 5,535 중 5,534(실패 1개는 새 임금 규칙에 맞춰 기대값을 고치고 그 파일만 다시 돌려 통과), 빌드·`check-pwa`·`check:bundle` 110,071 B, 화면 시험 building-screen 7/7·facilities 5/5·labor 4/4. build-mode·economy 화면 시험은 돌리지 않았다.
- 합친 뒤 검사: main 푸시 전 훅의 `pnpm check`(DB 시험 포함).
- 운반(1625·1626)은 기록만(질문 1786), 거래소 반입은 자리만(질문 1784) — 다음 줄기.
- 휴대폰에서 보지 않았다.

## 사용자 결정 대기
- 질문 1781~1790(`docs/questions/2026-11-15-business-2.md`) — 기획 세션에 보낸다.
