# 작업 기록 — 국가 미가입 가문의 세력 화면·홈 카드 모순 수정

- 일시: 2026-11-25 03:25 KST
- 작업 도구: Antigravity
- 관련 ADR: [2026-11-24-house-membership-separation.md](../../../adr/2026-11-24-house-membership-separation.md)

## 한 일

가문을 창설했지만 아직 도시·국가에 가입하지 않은 상태(`house_members`는 존재, `faction_members`는 없음)에서 세력 화면 상단 카드가 "아직 소속 세력이 없습니다 · 개인 · [가문 창설]"을 표시하면서 바로 아래에 "내 가문"이 함께 보이는 모순을 고쳤다.

1. **원인**
   - `apps/server/src/factionScreen/source.ts`의 `readFactionReal`이 `nation === null`일 때 이미 조회한 `house`를 버리고 `faction: null`만 돌려줬다.
   - `apps/server/src/factionScreen/overview.ts`가 `faction === null`이면 무조건 `stage: "individual"`로 내려보냈다.
   - `apps/game/src/faction/FactionSide.tsx`와 `apps/game/src/home/cards/ServerCard.tsx`는 `view.faction === null`만으로 개인(미창설) 상태를 그려 `[가문 창설]` 링크를 다시 노출했다.
2. **수정**
   - `packages/shared/src/faction.ts`: `FactionHouseSummary` 타입과 `FactionOverviewResponse.house` 선택 필드를 추가했다.
   - `apps/server/src/factionScreen/source.ts`: `housePart`가 해산되지 않은 가문(`f.dissolved_at_ms is null`)의 이름·약어·가문원 수·가문장 여부를 읽도록 보강하고, `nation === null`이어도 `house`를 유지해 반환하도록 고쳤다.
   - `apps/server/src/factionScreen/overview.ts`: `faction === null && house !== null`이면 `stage: "faction"`과 `house`를 응답에 싣도록 고쳤다.
   - `apps/game/src/faction/FactionSide.tsx`: `view.faction === null && view.house != null`일 때 `<NoFaction />`(개인·가문 창설 링크) 대신 `<HouseOnlyCard />`(가문 이름·약어·`가문·세력`·`국가 미소속`·도시 정부 방문 가입 안내)를 그리도록 고쳤다.
   - `apps/game/src/faction/FactionScreen.tsx`·`IdentityCard.tsx`: 가문 상태가 바뀌면 상단 세력 요약도 함께 다시 읽도록 연결했다.
   - `apps/game/src/home/cards/ServerCard.tsx`: 홈 화면 세력 카드도 국가 미가입 가문일 때 가문 이름과 `국가 미소속`을 보이도록 고쳤다.
   - `apps/game/messages/ko.json`·`en.json`: 새 문구 4쌍을 추가했다.

## 바꾼 파일과 이유

- `packages/shared/src/faction.ts` — `FactionHouseSummary` 및 `FactionOverviewResponse.house` 추가
- `apps/server/src/factionScreen/source.ts`, `overview.ts` — 국가 미가입 가문 유지 및 `stage: "faction"` 판정
- `apps/server/src/factionScreen/overview.test.ts`, `factionScreen.db.test.ts` — 미가입 가문·해산 가문 시험 추가
- `apps/game/src/faction/FactionSide.tsx`, `FactionScreen.tsx`, `identity/IdentityCard.tsx` — `HouseOnlyCard` 표시 및 가문 변경 시 상단 카드 동기화
- `apps/game/src/home/cards/ServerCard.tsx` — 홈 세력 카드 미가입 가문 표시
- `apps/game/messages/ko.json`, `en.json` — 한·영 문구 4쌍 추가

## 함께 바꿔야 하는 파일

- `docs/WORKLOG.md` (`pnpm docs:index`)

## 건드리지 말 것

- `docs/design/` (기획 미러)

## 미검증 · TODO

- Playwright 브라우저 E2E 화면 확인은 미실행.
