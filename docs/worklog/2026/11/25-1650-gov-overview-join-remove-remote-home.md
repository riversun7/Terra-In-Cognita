# 작업 기록 — 행정 건물 개요 탭 도시·국가 가입 추가 및 세력 탭 원격 가입 제거

- 일시: 2026-11-25 16:50 KST
- 작업 도구: Antigravity
- 관련 ADR: [2026-11-25-house-city-approval-and-blacklist.md](../../../adr/2026-11-25-house-city-approval-and-blacklist.md)

## 한 일

사용자 피드백을 반영해 도시·국가 가입 흐름을 현장 방문 전용으로 통일했다.

1. **2차맵 행정 건물 개요 탭에서 바로 도시·국가 가입**
   - `apps/game/src/government/cityJoinText.ts`로 승인 방식·차단 사유 문구 함수를 분리해 지연 조각(`GovernmentDialog`)을 끌지 않고 공용화했다.
   - `apps/game/src/government/GovernmentSheet.tsx`에 가입 방식 요약, 적대 세력 거주 유닛 경고, 차단 사유(`no_house`일 때는 `[가문 창설]` 링크 포함), 그리고 `[이 도시·국가에 가입]` / `[이 도시에 가문 가입 신청]` 버튼을 추가했다.
   - `apps/game/src/map/building/buildingReloadContext.ts`·`BuildingPanel.tsx`에서 `BuildingReloadContext`로 `reloadAll`을 전달해, 개요 탭에서 가입을 마치면 건물 접근 권한 배너와 정부 상태가 즉시 갱신되도록 했다.
2. **세력 탭 원격 도시·국가 가입 제거 및 서버 차단**
   - `apps/game/src/faction/identity/HouseHomeBlock.tsx`·`HouseSection.tsx`에서 원격 소속 도시 드롭다운과 `[도시 가입]` / `[소속 도시 바꾸기]` 폼을 제거하고, 행정 건물 직접 방문 가입 안내로 바꿨다(현재 소속 도시·가문 도시세·진행 중 이동 공고 거두기·재가입 대기 시각·소속 도시 탈퇴는 유지).
   - `apps/server/src/factionIdentity/houseHome.ts`에 `cancelOnly` 옵션을 두고, 실제 서버 배선(`apps/server/src/factionIdentity/attach.ts`)에서 `cancelOnly: true`를 넘겨 원격 `house_home`으로 도시를 가입·변경하려는 요청을 서버 권위로 `wrong_city`로 막고 공고 거두기만 허용하도록 했다.
   - `apps/server/src/factionIdentity/members.db.test.ts`에 `cancelOnly: true` 차단·공고 거두기 허용 검증을 추가했다.

## 바꾼 파일과 이유

- `apps/game/src/government/cityJoinText.ts`, `CityHousePanel.tsx`, `GovernmentSheet.tsx` — 행정 건물 개요 탭 직접 가입 버튼·안내·즉시 새로고침
- `apps/game/src/map/building/buildingReloadContext.ts`, `BuildingPanel.tsx` — 가입 후 건물 판 즉시 갱신 컨텍스트 연결
- `apps/game/src/faction/identity/HouseHomeBlock.tsx`, `apps/game/src/faction/identity/HouseSection.tsx` — 세력 탭 원격 도시·국가 가입 UI 제거 및 현장 방문 안내 표시
- `apps/server/src/factionIdentity/houseHome.ts`, `attach.ts`, `members.db.test.ts` — 실제 서버에서 원격 `house_home` 가입·변경 차단(공고 거두기만 허용) 및 DB 시험
- `apps/game/messages/ko.json`, `en.json` — 한·영 문구 3쌍 추가

## 함께 바꿔야 하는 파일

- `docs/WORKLOG.md` (`pnpm docs:index`)

## 건드리지 말 것

- `docs/design/` (기획 미러)

## 미검증 · TODO

- Playwright 브라우저 E2E 화면 테스트는 미실행.
