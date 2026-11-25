# 건물 정보 패널·정부 패널 UI 개편 및 전역 고유명사 표기(EntityRef) 통일

- 일시: 2026-11-25 18:04 (KST)
- 작업 도구: Antigravity
- 관련: 직전 커밋 `9c0a832a` (2차맵 행정 건물 개요 가입·원격 도시 가입 제거), 사용자 결정(2026-11-25: 캐릭터/유닛 안 B, 탭바 안 C, 소유·대주주 1명 표기, 시장 1순위·국가/지도자/가문 통합)

## 한 일
- 전역 고유명사(국가·도시·가문·캐릭터/유닛·건물) 표기용 디자인 토큰(`--color-entity-*`, 6개 테마 전체)과 공통 컴포넌트(`EntityRef`, `EntitySymbol`, `EntityPopup`)를 새로 만들었다.
  - 캐릭터·유닛은 역할별 인라인 SVG 심볼 아이콘(`cyborg`, `leader`, `mayor`, `human`, `android`, `creature`) + 고유 색 + 굵은 글자로 통일했다(안 B).
  - 클릭 가능한 고유명사는 점선 밑줄·호버 강조로 구분하고 누르면 HTML top-layer `<dialog>` 세부 팝업(`EntityPopup`)을 띄우거나 지정된 동작(지분 탭 이동·세력 화면 이동)을 실행한다.
- 건물 정보 패널(`BuildingPanel`, `BuildingAccessControl`, `building.css`, `ShareMarket`)을 개편했다.
  - 기존 알약형 탭을 아이콘 + 짧은 글자 언더라인 전략 탭바(안 C)로 바꾸고, 헤더·접근 권한 카드·경고 띠 여백을 압축했다.
  - 소유 표기를 "주인"에서 "소유"로 바꾸고, 지분이 나뉜 사업장은 대주주 1명과 지분율만 보여 주며 클릭 시 바로 `[지분]` 탭으로 이동한다.
- 정부 패널(`GovernmentDialog`, `MayorFact`, `GovernmentSheet`, `LeaderHead`, `LeaderSheet`, `government.css`) 정보 위계를 개편했다.
  - 도시 시장을 가장 눈에 띄는 1순위 히어로 카드로 올리고, 국가·국가 지도자·지배 가문을 2순위 통합 카드 하나로 묶어 각 고유명사 클릭 시 세부 팝업 및 `[세력 화면 열기]` 이동을 제공한다.
  - 기존 E2E 시험 선택자(`government-mayor`, `government-nation`, `government-leader`, `.government-leader-house`, `.government-leader-rule`)와 최소 터치 크기(`--tap-min`)를 유지했다.
- 전역 주요 화면(`CityHousePanel`, `BuildingLabor`, `FactionSide`, `FactionCities`, `HouseSection`, `UnitList`, `UnitDetail`)에 `EntityRef`를 적용했다.
- 화폐 단위 전용 명조/세리프 각인체 토큰(`--font-currency`)을 추가하고, `Money`(`.money-unit` — 국고·기준 통화·외환 보유고·지갑·추정 가치), 정부 도시 화폐(`.gov-money-name`), 거래소·외환·주문·임금 화면 화폐 이름(`.eco-quote-currency`, `.eco-currency-unit`)에 적용했다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css` | 6개 테마(`pastel`, `dark`, `contrast`, `station`, `dev-neon`, `dev-light`)에 `--color-entity-*` 토큰 7종 추가 |
| `apps/game/src/ui/EntityRef.tsx` | 전역 고유명사 심볼 아이콘(`EntitySymbol`), 인라인 참조(`EntityRef`), 최상위 세부 팝업(`EntityPopup`) 구현 |
| `apps/game/src/ui/entityRef.css` | 고유명사 종류·역할 색, 클릭 밑줄·호버, 세부 팝업 토큰 전용 스타일 |
| `apps/game/messages/ko.json`, `apps/game/messages/en.json` | 소유·대주주·고유명사 팝업·정부 통합 카드 다국어 키 추가 및 `주인` → `소유` 문구 개편 |
| `apps/game/src/map/building/BuildingPanel.tsx`, `BuildingAccessControl.tsx`, `building.css` | 안 C 아이콘 언더라인 탭바, 소유/대주주 1명 클릭 → 지분 탭 이동, 헤더·접근 권한 밀도 개선, 안쪽 유닛 `EntityRef` 팝업 |
| `apps/game/src/map/business/ShareMarket.tsx` | 주주 목록 `HolderBars`에 `EntityRef` 적용 |
| `apps/game/src/government/GovernmentDialog.tsx`, `MayorFact.tsx`, `GovernmentSheet.tsx`, `LeaderHead.tsx`, `LeaderSheet.tsx`, `government.css` | 시장 1순위 히어로 카드 + 국가·지도자·지배 가문 통합 카드, 도시·시장·국가·지도자·가문 클릭 팝업 및 세력 이동 |
| `apps/game/src/government/CityHousePanel.tsx`, `apps/game/src/map/building/BuildingLabor.tsx` | 신청/소속 가문, 블랙리스트 사이보그, 건물 계약 일꾼에 `EntityRef` 적용 |
| `apps/game/src/faction/FactionSide.tsx`, `FactionCities.tsx`, `identity/HouseSection.tsx` | 세력 지도자·종주국·봉신국·가문·가문원·도시·시장에 `EntityRef` 적용 |
| `apps/game/src/units/UnitList.tsx`, `UnitDetail.tsx` | 유닛 목록·상세 제목에 역할별 `EntityRef` 적용 |
| `apps/game/src/ui/money.css`, `apps/game/src/economy/economy.css`, `apps/game/src/economy/market/market.css`, `apps/game/src/economy/ExchangeView.tsx`, `OrdersView.tsx`, `ProductionView.tsx`, `MarketCitiesView.tsx`, `MarketItemsView.tsx` | 화폐 단위 전용 명조/세리프 각인체(`--font-currency`) 적용 |

## 함께 바꿔야 하는 파일
- `apps/game/src/styles/tokens.css`에 `--color-entity-*` 토큰을 더할 때는 6개 테마 블록 모두 함께 맞춰야 `pnpm check:contrast`가 통과한다.
- 새 고유명사 팝업 문구를 더할 때는 `apps/game/messages/ko.json`과 `en.json`을 함께 고친다.

## 건드리지 말 것
- `GovernmentDialog.tsx`와 `MayorFact.tsx`의 `data-part="government-mayor"`, `government-nation`, `government-leader`, `.government-leader-house`, `.government-leader-rule`, `dd` 구조(`e2e/government.spec.ts`가 검증).
- `.entity-ref-btn`, `.bp-tab`, `.bp-chip-btn`의 `min-inline-size` / `min-block-size: var(--tap-min)`(모바일 터치 크기 검사 `smallTapTargets`).

## 미검증·TODO·알려진 문제
- 검증 완료(Verified): `pnpm --filter @terra/game build`, `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm check:bundle`, `pnpm check:docs`, `pnpm --filter @terra/game test`.
- 미실행(Unrun): Playwright E2E(`e2e/government.spec.ts` 등) 실제 브라우저 렌더링 확인.
- 참고: `apps/game/src/government/PersonFact.tsx`는 현재 직접 참조가 없으나 후속 정리 시 제거 여부를 결정한다.

## 사용자 결정 대기
- 개편된 건물 패널·정부 패널·전역 고유명사 UI를 커밋·푸시할지 확인 필요.
