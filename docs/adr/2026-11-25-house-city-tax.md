# 가문 도시세 분리(일정액·시장 기본 권한·주기 정책·체납 빚과 신용 하락)

- 상태: 확정
- 날짜: 2026-11-25
- 관련: ADR `2026-11-24-house-membership-separation.md`(1단계), `2026-11-25-house-city-approval-and-blacklist.md`(2단계), `2026-11-21-credit.md`(신용 장부), `2026-10-28-time-and-session-protocol.md`(프로토콜 71)

## 배경

사용자 결정(2026-11-24, 3단계 범위):
- 가문이 소속 도시에 내는 세금(**가문 도시세**)은 기존 가문원 수입에서 가문 금고로 걷는 세금(**가문 내부 회비**)과 별개로 분리하고 명칭을 분명히 구분한다.
- 과세 기준: 우선 일정 금액(정수 최소 단위)을 도시 정책으로 정한다.
- 세율 결정자: 정책으로 정하되 **시장(도시 주인 가문장)**이 기본 권한이다(`mayor` | `leader`).
- 납부 주기 및 미납 처리: 매일·3일·1주·2주(`1 | 3 | 7 | 14`일) 중 정책으로 정하고, 미납 시 **빚으로 남기며 신용을 하락**시킨다.

## 선택지

1. 체납 빚과 신용 하락 연동 방식:
   - 가) 주민세 체납(`debt:resident:…`)과 같은 복식 원장 빚 계정(`debt:house_city_tax:<가문>:<도시>:<화폐>`, 짝 `claim:house_city_tax:<도시>:<화폐>`)을 쓰고, `CreditBook`의 `debt:` 자동 감시(`observe`)에 연결한다. (고름 — 새 화폐 생성 없음, 전액 상환 시 즉시 신용 복구, 기존 `credit_marks_kind` 제약과 직전 판 앱 호환 유지)
   - 나) `house_city_tax_state` DB 열만 쓰고 원장 빚 계정을 두지 않음 — 신용 장부 자동 복구(`observe`)와 복식 원장 일관성이 깨진다.
2. 기존 `house_policies.tax_pm` 명칭 정리:
   - 가) DB 열·프로토콜 키(`house_tax`)는 호환을 위해 유지하고, 화면 문구(ko·en)를 **가문 내부 회비(House internal dues)**로 고쳐 **가문 도시세(House city tax)**와 구분한다. (고름 — 무중단 호환)

## 결정

1. **DB 스키마(더하기만, 직전 판 앱 호환)**:
   - `city_policies`: `house_city_tax_amount`(bigint, null = 비과세), `house_city_tax_period_days`(integer, null = 기본 7일), `house_city_tax_setter`(text, `"mayor" | "leader"`, null = 기본 `"mayor"`).
   - `house_city_tax_state`: 가문별 마지막 징수 시각(`last_billed_at_ms`), 체납 빚(`debt`), 빚 화폐(`debt_asset`), 연속 체납 주기 수(`missed_cycles`).
2. **프로토콜 71(최소 70)**:
   - 새 WebSocket 메시지 2종(`packages/protocol/src/house.ts`): `house_city_tax_policy`(도시세 금액·주기·권한자 설정), `house_city_tax_pay`(체납 빚 즉시 납부) → `house_member_result`로 응답.
   - 새 행동(`city_tax_policy_set`·`city_tax_paid`)과 실패 코드(`invalid_period`·`no_debt`)는 71판 연결에만 보내고 70판 이하 연결은 호환 코드로 낮춘다.
3. **징수·체납·상환(`factionIdentity/houseCityTax.ts`, `credit/book.ts`)**:
   - 주기(1·3·7·14일)가 지난 소속 가문(도시 주인 가문 자신은 제외)에 대해 가문 금고(`vault:house:…`)에서 도시 화폐로 소속 도시 국고에 징수한다.
   - 기존 빚을 먼저 갚고 남은 금액으로 이번 주기 세금을 낸다. 모자란 몫은 `debt:house_city_tax:…` / `claim:house_city_tax:…`로 빚을 남기고, `CreditBook.houseTaxArrears`로 가문장 신용 점수를 깎는다(`rules.resident` 기준, `credit_marks`에 기록).
   - 가문장이 `[체납 세금 납부]`(`house_city_tax_pay`)를 실행하면 가문 금고(부족 시 가문장 지갑)에서 빚을 갚고, 빚이 0이 되는 순간 `CreditBook.observe`가 신용 벌점을 자동 복구한다.
4. **화면 UI 및 명칭 구분**:
   - 기존 내부 가문세 문구를 **가문 내부 회비**(House internal dues)로 구분한다.
   - 정부 대화상자(`CityHousePanel.tsx`)에 가문 도시세 정책 조회·설정과 소속 가문별 체납 표시를 추가한다.
   - 세력 화면(`HouseHomeBlock.tsx`)에 소속 도시 가문 도시세 현황·다음 납부일·체납 빚 경고 및 `[체납 세금 납부]` 단추를 추가한다.

## 이유

- 복식 원장 빚 계정(`debt:house_city_tax:…`)은 주민세 빚(`debt:resident:…`)과 같은 구조를 쓰므로 `CreditBook.observe`의 전액 상환 즉시 복구 규칙을 그대로 재사용할 수 있다(Verified: `apps/server/src/credit/book.ts`).
- `house_city_tax_state`에 체납 요약을 함께 적으면 정부 판과 세력 화면 조회가 원장 전체 스캔 없이 빠르게 읽힌다.

## 결과

- 좋은 점: 가문 내부 회비(가문원→가문 금고)와 가문 도시세(가문 금고→소속 도시 국고)가 개념·원장·화면 모두에서 명확히 분리된다.
- 감수할 점: 도시를 보유한 가문(도시 주인)은 자기 도시에 가문 도시세를 내지 않는다(같은 주머니 이체 방지).
- 다시 볼 조건: 4단계(건물별 접근 권한)에서 체납 가문의 공공시설 이용 제한 정책을 연동할 때 `house_city_tax_state.debt > 0`을 조회할 수 있다.
