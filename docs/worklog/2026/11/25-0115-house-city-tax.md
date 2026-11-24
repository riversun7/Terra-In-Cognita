# 가문 도시세 분리(일정액·시장 기본 권한·주기 정책·체납 빚과 신용 하락, 3단계)

- 일시: 2026-11-25 01:15 KST
- 작업 도구: Antigravity
- 관련 ADR: [2026-11-25-house-city-tax.md](../../../adr/2026-11-25-house-city-tax.md), [2026-11-25-house-city-approval-and-blacklist.md](../../../adr/2026-11-25-house-city-approval-and-blacklist.md)

## 한 일

1. **DB 스키마·마이그레이션(더하기만, 직전 판 앱 호환)**:
   - `city_policies`에 `house_city_tax_amount`(일정액), `house_city_tax_period_days`(1·3·7·14일), `house_city_tax_setter`(`mayor` | `leader`) 열을 추가하고, 가문별 마지막 징수 시각·체납 빚을 기록하는 `house_city_tax_state` 표를 신설했다.
2. **프로토콜 71(최소 70)**:
   - WebSocket 메시지 `house_city_tax_policy`(정책 설정)·`house_city_tax_pay`(체납 납부), 결과 행동 `city_tax_policy_set`·`city_tax_paid`, 실패 코드 `invalid_period`·`no_debt`와 70판 호환 낮추기를 추가했다.
3. **가문 도시세 징수·체납 빚·신용 하락 및 자동 복구(`houseCityTax.ts`, `credit/book.ts`)**:
   - 도시 정책에 따라 주기(1·3·7·14일)가 지난 소속 가문(도시 주인 가문 자신 제외)의 가문 금고에서 소속 도시 국고로 일정액을 징수한다.
   - 잔고가 모자라면 복식 원장 빚 계정(`debt:house_city_tax:…` / `claim:house_city_tax:…`)에 체납 빚을 남기고 `CreditBook.houseTaxArrears`로 가문장 신용 점수를 깎으며 `city_tax_arrears` 소식을 보낸다.
   - 가문장이 `house_city_tax_pay`로 체납 빚을 전액 납부하면(가문 금고 우선 → 부족 시 가문장 지갑) `CreditBook.observe`가 원장 빚 계정 0을 감지해 신용 점수를 즉시 복구한다.
4. **명칭 구분 및 UI 반영**:
   - 기존 가문원 수입 → 가문 금고 세금 문구를 **가문 내부 회비**(House internal dues)로 분명히 구분했다.
   - 정부 대화상자(`CityHousePanel.tsx`)에 [가문 도시세 정책] 조회·설정과 소속 가문 목록의 체납 금액 표시를 추가했다.
   - 세력 화면(`HouseHomeBlock.tsx`)에 [가문 도시세] 현황·다음 납부 예정·체납 경고 및 `[체납 세금 납부]` 단추를 추가했다.

## 바꾼 파일과 이유

- `docs/adr/2026-11-25-house-city-tax.md`: 3단계 설계·프로토콜 71·원장 빚 계정 결정 기록.
- `apps/server/src/db/houseSchema.ts`, `apps/server/drizzle/20261124160749_house_city_tax/*`: 도시세 정책 열과 체납 상태 표 추가.
- `packages/protocol/src/version.ts`, `house.ts`, `index.ts`, `house.test.ts`: 프로토콜 71 메시지·코드·호환 함수 및 시험.
- `packages/shared/src/government.ts`, `house.ts`: `GovernmentHouseCityTax`, `HouseCityTaxView`, `HOUSE_CITY_TAX_PERIOD_DAYS`, `city_tax_arrears` 소식 종류.
- `apps/server/src/sessionHouse.ts`, `session.ts`, `sessionHouse.test.ts`: 새 2종 메시지 라우팅 및 판 문턱.
- `apps/server/src/credit/book.ts`: `houseTaxArrears` 추가.
- `apps/server/src/factionIdentity/houseCityTax.ts`, `houseCityTax.db.test.ts`: 정책 설정·주기 징수·체납 납부·조회 및 DB+원장+신용장부 통합 시험.
- `apps/server/src/factionIdentity/gateway.ts`, `attach.ts`, `houseCityJoin.ts`, `houseView.ts`: 게이트웨이·주기 타이머·정부 판/세력 화면 조회 연결.
- `apps/game/src/faction/identity/houseCommands.ts`, `houseText.ts`, `HouseVaultBlock.tsx`, `HouseHomeBlock.tsx`, `HouseSection.tsx`, `apps/game/src/government/CityHousePanel.tsx`, `apps/game/messages/ko.json`, `en.json`: 명칭 구분, 정책·체납 납부 UI 및 한국어·영어 문구.

## 함께 바꿔야 하는 파일

- 4단계(건물별 접근 권한)에서 체납 가문의 공공시설 이용 제한을 연계할 때 `house_city_tax_state.debt > 0`을 조회할 수 있다.

## 건드리지 말 것

- 올라간 마이그레이션 `apps/server/drizzle/20261124160749_house_city_tax/`는 수정하지 않는다.
- `docs/design/` 기획 미러 파일은 직접 수정하지 않는다.

## 미검증 · TODO

- Playwright E2E 화면 시험: 미실행.
- 남은 단계: 4단계(건물별 접근 권한 범위 — 누구나/도시 거주자/도시 가문/국가 시민 — 및 외부인 건설 정책).
