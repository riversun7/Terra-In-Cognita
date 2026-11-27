// 경제 흐름 모식도(/dev/economy-flow) 자료·포맷 — 보기 전용 개발자 문서·모식도 데이터.
// - 게임 앱은 @terra/sim을 import할 수 없으므로(AGENTS 4장), 코드·팩(content/core/tuning.json·nation_presets.json·necessities.json) 기본값을
//   여기에 모으고 단위 테스트(economyFlowData.test.ts)가 content/core/tuning.json 값과 1:1 일치하는지 검증한다.
// - 서버가 열려 있으면 화면이 api.tuning.list로 현재 덮어쓴 값을 읽어 기본값과 나란히 보인다.

export type ActorId =
  | "central_bank"
  | "government"
  | "business"
  | "exchange"
  | "unit"
  | "house_player"
  | "services"
  | "planned";

export type FlowCategory = "tax" | "labor" | "trade" | "consume" | "invest" | "monetary";

export type ImplStatus = "live" | "partial" | "planned";

export type TermSign = "plus" | "minus" | "equals" | "tax" | "split";

export type ValueUnit = "bp" | "pm" | "ms" | "minor" | "milli" | "count" | "grams" | "days" | "pct" | "raw";

/** 수식 등식 한 마디(예: + 매출, − 비용, = 수익, − 세금, → 정산) */
export interface EquationStep {
  readonly sign: TermSign;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

/** 주체 카드 안 세부 항목(기본값 + 선택적 튜닝 키 연동) */
export interface EconomyLineItem {
  readonly id: string;
  readonly group: "in" | "out" | "tax" | "split" | "rule";
  readonly category: FlowCategory;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly flowKo: string;
  readonly flowEn: string;
  /** 사람 눈에 바로 읽히는 기본값 요약(팩·코드 기본값) */
  readonly defaultKo: string;
  readonly defaultEn: string;
  /** content/core/tuning.json 키 ID(있으면 라이브 서버 값과 대조·테스트로 일치 검증) */
  readonly tuningId?: string | undefined;
  /** tuningId의 팩 기본 숫자값(테스트 대조 및 라이브 변경 판정 기준) */
  readonly packValue?: number | undefined;
  /** 라이브 값 포맷 단위 */
  readonly unit?: ValueUnit | undefined;
  /** 튜닝 키가 없을 때 코드/팩 출처 표기 */
  readonly sourceLabel?: string | undefined;
  readonly status: ImplStatus;
}

/** 경제 주체 하나(SVG 노드 + 손익 수식 카드) */
export interface EconomyActor {
  readonly id: ActorId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly formulaSummaryKo: string;
  readonly formulaSummaryEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  /** SVG 캔버스(1120 × 680) 안 박스 배치 */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 노드 강조 색 카테고리 */
  readonly accent: FlowCategory;
  readonly status: ImplStatus;
  readonly equation: readonly EquationStep[];
  readonly items: readonly EconomyLineItem[];
}

/** SVG 모식도의 주체 간 돈 흐름 화살표 */
export interface EconomyFlowEdge {
  readonly id: string;
  readonly from: ActorId;
  readonly to: ActorId;
  readonly category: FlowCategory;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly defaultTagKo: string;
  readonly defaultTagEn: string;
  /** 곡선 휘어짐(직선 수직 오프셋 px, 양방향 화살표가 겹치지 않게 분리) */
  readonly bend: number;
  /** 라벨 위치(0~1 곡선 t, 기본 0.5) */
  readonly labelT?: number | undefined;
  readonly status: ImplStatus;
}

/** SVG 캔버스 기준 크기 */
export const DIAGRAM_VIEWBOX = { width: 1120, height: 680 } as const;

export const FLOW_CATEGORIES: readonly FlowCategory[] = [
  "tax",
  "labor",
  "trade",
  "consume",
  "invest",
  "monetary",
];

/** 8대 경제 주체 + 손익 수식 + 코드·팩 기본값 */
export const ECONOMY_ACTORS: readonly EconomyActor[] = [
  {
    id: "central_bank",
    titleKo: "중앙은행 · 통화 발행/소각",
    titleEn: "Central Bank · Mint & Burn",
    subtitleKo: "세력 화폐 생성(Mint)과 소멸(Burn) 경계",
    subtitleEn: "Faction currency creation (mint) & destruction (burn)",
    formulaSummaryKo: "초기 발행 + 물가 조절 발행 − 발행 이자 소각 − 시스템 소각",
    formulaSummaryEn: "Initial Mint + Price-Target Mint − Interest Burn − System Burn",
    badgeKo: "MONETARY · D-131·D-303",
    badgeEn: "MONETARY · D-131·D-303",
    x: 32,
    y: 26,
    w: 256,
    h: 122,
    accent: "monetary",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "초기·물가 발행 (+)",
        labelEn: "Initial & Target Mint (+)",
        detailKo: "인구 × 200 × 7일, 목표 물가 100% 미만 시 일 최대 +3%",
        detailEn: "Pop × 200 × 7d; up to +3%/day when CPI < 100%",
      },
      {
        sign: "minus",
        labelKo: "발행 이자 소각 (−)",
        labelEn: "Issuance Interest Burn (−)",
        detailKo: "발행 잔액 × 일 0.01% (세금보다 먼저 소각)",
        detailEn: "Outstanding × 0.01%/day (burned before tax split)",
      },
      {
        sign: "minus",
        labelKo: "긴축·시스템 소각 (−)",
        labelEn: "Tightening & Sink Burn (−)",
        detailKo: "물가 초과 시 일 최대 −3%, 마을 설립·환생·융합·구인 등 소각",
        detailEn: "Up to −3%/day above target; village, rebirth, fusion, recruit sinks",
      },
    ],
    items: [
      {
        id: "cb_init_mint",
        group: "in",
        category: "monetary",
        nameKo: "나라 초기 화폐 발행 (E6)",
        nameEn: "Initial currency mint (E6)",
        flowKo: "발행 계정 → 나라 국고",
        flowEn: "Mint account → Nation treasury",
        defaultKo: "인구 × 200 × 7일 (1인당 하루 거래액 200)",
        defaultEn: "Pop × 200 × 7 days (200/capita/day)",
        sourceLabel: "SERVER_ECONOMY_SETTINGS.perCapitaDaily",
        status: "live",
      },
      {
        id: "cb_target",
        group: "rule",
        category: "monetary",
        nameKo: "중앙은행 목표 물가 지수",
        nameEn: "Central bank target CPI",
        flowKo: "생필품 시세 ÷ 시작 시세 기준",
        flowEn: "Necessity price ÷ start price",
        defaultKo: "1,000‰ (시작 시세 100%)",
        defaultEn: "1,000‰ (100% of start price)",
        tuningId: "npc_bank_target",
        packValue: 1000,
        unit: "pm",
        status: "live",
      },
      {
        id: "cb_gain",
        group: "rule",
        category: "monetary",
        nameKo: "통화 조절 이득 (테일러 준칙)",
        nameEn: "Monetary policy gain (Taylor rule)",
        flowKo: "시중 통화량 × 이득 × 물가 오차",
        flowEn: "Circulating × gain × CPI gap",
        defaultKo: "2,000 bp (20.00%)",
        defaultEn: "2,000 bp (20.00%)",
        tuningId: "npc_bank_gain",
        packValue: 2000,
        unit: "bp",
        status: "live",
      },
      {
        id: "cb_daily_cap",
        group: "rule",
        category: "monetary",
        nameKo: "하루 발행·소각 상한 (E5)",
        nameEn: "Daily mint/burn cap (E5)",
        flowKo: "시중 통화량 대비 하루 최대 조절폭",
        flowEn: "Max daily adjustment of circulating supply",
        defaultKo: "300 bp (일 ±3.00%)",
        defaultEn: "300 bp (±3.00%/day)",
        tuningId: "npc_bank_daily_cap",
        packValue: 300,
        unit: "bp",
        status: "live",
      },
      {
        id: "cb_interest",
        group: "out",
        category: "monetary",
        nameKo: "발행 이자 하루 이율 (S1·D-303)",
        nameEn: "Daily issuance interest burn (S1)",
        flowKo: "나라 국고 → 소각 계정 (세금 정산 1순위)",
        flowEn: "Nation treasury → Burn (1st priority)",
        defaultKo: "1 bp (일 0.01%)",
        defaultEn: "1 bp (0.01%/day)",
        tuningId: "npc_bank_interest",
        packValue: 1,
        unit: "bp",
        status: "live",
      },
      {
        id: "cb_system_sinks",
        group: "out",
        category: "monetary",
        nameKo: "시스템 서비스·생성 소각 (D-169)",
        nameEn: "System service sinks (D-169)",
        flowKo: "유저·유닛 지갑 → 소각",
        flowEn: "Player/Unit wallet → Burn",
        defaultKo: "마을 5,000 · 환생 10,000 · 신격화 20,000 · 융합 5,000 · 쿠데타 실패 50,000",
        defaultEn: "Village 5,000 · Rebirth 10,000 · Deify 20,000 · Fusion 5,000 · Failed coup 50,000",
        sourceLabel: "tuning (house/temple/fusion/gov)",
        status: "live",
      },
    ],
  },
  {
    id: "government",
    titleKo: "정부 · 국고 (국가 / 도시)",
    titleEn: "Government · Treasury (Nation / City)",
    subtitleKo: "조세 징수 → ① 이자 소각 → ② 운영비 → ③ 체제별 배당",
    subtitleEn: "Taxes → ① Interest burn → ② Operating → ③ Regime split",
    formulaSummaryKo: "세입(거래·소득·주민·가문도시·상속·공물) − ① 이자소각 − ② 운영비 = ③ 이익 → 배당",
    formulaSummaryEn: "Tax Revenue − ① Interest Burn − ② City Ops = ③ Surplus → Regime Split",
    badgeKo: "PUBLIC · D-128·D-304",
    badgeEn: "PUBLIC · D-128·D-304",
    x: 422,
    y: 26,
    w: 276,
    h: 122,
    accent: "tax",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "세입·공물 (+)",
        labelEn: "Taxes & Tribute (+)",
        detailKo: "거래세 2% · 사업장/임금 소득세 2% · 주민세 · 가문 도시세 · 상속세 50% · 공물 5%",
        detailEn: "Trade 2% · Income 2% · Resident · House-city · Inheritance 50% · Tribute 5%",
      },
      {
        sign: "minus",
        labelKo: "① 발행 이자 소각 (−)",
        labelEn: "① Interest Burn (−)",
        detailKo: "발행 잔액 × 일 0.01% 우선 차감",
        detailEn: "0.01%/day of money supply burned first",
      },
      {
        sign: "minus",
        labelKo: "② 도시 운영비 (−)",
        labelEn: "② City Operating (−)",
        detailKo: "공공 건설·연구, 정착 지원금(72~108), 현상금(상한 5,000)",
        detailEn: "Public builds/research, grants (72–108), bounties (cap 5,000)",
      },
      {
        sign: "split",
        labelKo: "③ 남은 이익 정산 (→)",
        labelEn: "③ Profit Split (→)",
        detailKo: "7일 주기: 자본주의=주주, 독재=지배 가문 금고, 민주=국고 유보",
        detailEn: "7d cycle: Capitalism→Shareholders, Dictatorship→Ruling house, Democracy→Treasury",
      },
    ],
    items: [
      {
        id: "gov_trade_tax",
        group: "in",
        category: "tax",
        nameKo: "거래세 기본값 (국가 프리셋)",
        nameEn: "Default trade tax (nation preset)",
        flowKo: "거래소 매도자 → 도시 소유 나라 국고",
        flowEn: "Exchange seller → City nation treasury",
        defaultKo: "200 bp (2.00%, NPC 규칙 상한 20% / 스텝 1%)",
        defaultEn: "200 bp (2.00%, NPC rule cap 20% / step 1%)",
        sourceLabel: "DEFAULT_TAX_BP / nation_presets.json",
        status: "live",
      },
      {
        id: "gov_npc_tax_max",
        group: "rule",
        category: "tax",
        nameKo: "NPC 세율 규칙식 상한 · 조정폭",
        nameEn: "NPC tax rule cap & step",
        flowKo: "만족도 50 이상일 때만 단계 인상",
        flowEn: "Raised only when satisfaction ≥ 50",
        defaultKo: "상한 2,000 bp (20%) · 스텝 100 bp (1%)",
        defaultEn: "Cap 2,000 bp (20%) · Step 100 bp (1%)",
        tuningId: "d323_tax_max",
        packValue: 2000,
        unit: "bp",
        status: "live",
      },
      {
        id: "gov_city_shares",
        group: "rule",
        category: "invest",
        nameKo: "도시 주식 발행 수 (D-130)",
        nameEn: "City shares issued (D-130)",
        flowKo: "도시 건립 시 자동 발행 · 1주 1표",
        flowEn: "Issued on founding · 1 share = 1 vote",
        defaultKo: "1,000주 (동시호가 주기 30분)",
        defaultEn: "1,000 shares (30m call auction)",
        tuningId: "d130_shares_per_city",
        packValue: 1000,
        unit: "count",
        status: "live",
      },
      {
        id: "gov_dividend_period",
        group: "split",
        category: "invest",
        nameKo: "도시 세금 정산 · 배당 주기 (E20)",
        nameEn: "City tax settlement & dividend period",
        flowKo: "국고 → 도시 주주 지갑 / 지배 가문 금고",
        flowEn: "Treasury → City shareholders / Ruling house",
        defaultKo: "7일 (604,800,000 ms)",
        defaultEn: "7 days (604,800,000 ms)",
        tuningId: "d130_dividend_every",
        packValue: 604_800_000,
        unit: "ms",
        status: "live",
      },
      {
        id: "gov_tribute",
        group: "in",
        category: "tax",
        nameKo: "속국·봉신 공물 (S33)",
        nameEn: "Vassal tribute (S33)",
        flowKo: "속국 국고 → 종주국 국고 (7일마다)",
        flowEn: "Vassal treasury → Overlord treasury (7d)",
        defaultKo: "50‰ (5.0%, 보호 조약 상한 50‰)",
        defaultEn: "50‰ (5.0%, protection treaty cap 50‰)",
        tuningId: "s33_tribute_rate",
        packValue: 50,
        unit: "pm",
        status: "live",
      },
      {
        id: "gov_inheritance",
        group: "in",
        category: "tax",
        nameKo: "휴먼 사망 상속세 (S22)",
        nameEn: "Human inheritance tax (S22)",
        flowKo: "사망 휴먼 지갑 → 나라 국고 (나머지 50% 소유자)",
        flowEn: "Deceased human purse → Treasury (rest 50% owner)",
        defaultKo: "5,000 bp (50.00%)",
        defaultEn: "5,000 bp (50.00%)",
        tuningId: "s22_inheritance_tax",
        packValue: 5000,
        unit: "bp",
        status: "live",
      },
      {
        id: "gov_grant",
        group: "out",
        category: "tax",
        nameKo: "신규 사이보그 정착 지원금 (N39)",
        nameEn: "New cyborg settlement grant (N39)",
        flowKo: "시작 나라 국고 → 사이보그 지갑 (1회)",
        flowEn: "Starting nation treasury → Cyborg wallet (once)",
        defaultKo: "기본 72 × 세력 배율 100%~150% (최대 108)",
        defaultEn: "Base 72 × faction scale 100%–150% (max 108)",
        tuningId: "n39_grant_base",
        packValue: 72,
        unit: "minor",
        status: "live",
      },
      {
        id: "gov_citizenship",
        group: "in",
        category: "tax",
        nameKo: "귀화 입회비 / 지원금",
        nameEn: "Naturalization fee / grant",
        flowKo: "플레이어 ↔ 받는 나라 국고 (대기 7일)",
        flowEn: "Player ↔ Receiving nation treasury (7d cooldown)",
        defaultKo: "+100 (+입회비 / −지원금)",
        defaultEn: "+100 (+fee / −grant)",
        tuningId: "citizenship_fee",
        packValue: 100,
        unit: "minor",
        status: "live",
      },
      {
        id: "gov_bounty_cap",
        group: "out",
        category: "tax",
        nameKo: "블랙리스트 현상금 상한",
        nameEn: "Blacklist bounty cap",
        flowKo: "도시 국고 → 처치 플레이어",
        flowEn: "City treasury → Killer player",
        defaultKo: "건당 5,000",
        defaultEn: "5,000 per bounty",
        tuningId: "house_blacklist_bounty_max",
        packValue: 5000,
        unit: "minor",
        status: "live",
      },
    ],
  },
  {
    id: "exchange",
    titleKo: "거래소 (물자 · 외환 · 증권)",
    titleEn: "Exchanges (Goods · FX · Shares)",
    subtitleKo: "건물 기반 사업장 — 이용료 수입은 거래소 금고, 거래세는 국고",
    subtitleEn: "Facility-owned business — usage fees to vault, trade tax to treasury",
    formulaSummaryKo:
      "수입(거래·환전·지분 이용료 + 창고 확장 + 자리 임대) − 비용(인건비·수리) = 수익 − 소득세",
    formulaSummaryEn: "Fees (Goods/FX/Shares + Locker + Desk Rent) − Costs (Labor/Repair) = Profit − Tax",
    badgeKo: "MARKET · D-125·D-561",
    badgeEn: "MARKET · D-125·D-561",
    x: 822,
    y: 26,
    w: 266,
    h: 122,
    accent: "trade",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "이용료·임대 (+)",
        labelEn: "Usage Fees & Rent (+)",
        detailKo: "물자 0.5% · 환전 0.5% · 증권 0.5% · 창고 확장 100 · 거래 직무 자리값",
        detailEn: "Goods 0.5% · FX 0.5% · Shares 0.5% · Locker +100 · Trade desk rent",
      },
      {
        sign: "minus",
        labelKo: "운영 비용 (−)",
        labelEn: "Operating Costs (−)",
        detailKo: "배치 직원 인건비, 건물 노화 수리 재료·노동",
        detailEn: "Staff wages, facility decay repair materials & labor",
      },
      {
        sign: "tax",
        labelKo: "소득세 + 별도 거래세",
        labelEn: "Income Tax + Trade Tax",
        detailKo: "이용료 수입에 사업장 소득세 2% (체결 거래세 2%는 매도자→국고 직행)",
        detailEn: "2% business income tax on fee revenue (2% trade tax goes seller → treasury)",
      },
      {
        sign: "split",
        labelKo: "정산 배당 (→)",
        labelEn: "Settlement (→)",
        detailKo: "일반 사업장과 동일하게 1일 자동 정산 → 지분 주주 배당",
        detailEn: "Daily settlement to exchange facility shareholders",
      },
    ],
    items: [
      {
        id: "ex_goods_fee",
        group: "in",
        category: "trade",
        nameKo: "물자 거래소 이용료 (연속 체결)",
        nameEn: "Goods exchange fee (continuous)",
        flowKo: "매도자 체결액 → 물자 거래소 금고",
        flowEn: "Seller fill amount → Goods exchange vault",
        defaultKo: "50 bp (0.50%, 주인 설정 0%~10%)",
        defaultEn: "50 bp (0.50%, owner range 0%–10%)",
        tuningId: "exchange_fee_bp",
        packValue: 50,
        unit: "bp",
        status: "live",
      },
      {
        id: "ex_fx_fee",
        group: "in",
        category: "trade",
        nameKo: "외환 거래소 환전 이용료 (1시간 동시호가)",
        nameEn: "FX exchange fee (1h call auction)",
        flowKo: "화폐 매도자 수령액 → 최저가 외환 거래소 금고",
        flowEn: "FX seller proceeds → Cheapest FX exchange vault",
        defaultKo: "50 bp (0.50%, 주인 설정 0%~10%, 로트 10)",
        defaultEn: "50 bp (0.50%, owner range 0%–10%, lot 10)",
        tuningId: "exchange_fx_fee_bp",
        packValue: 50,
        unit: "bp",
        status: "live",
      },
      {
        id: "ex_share_fee",
        group: "in",
        category: "trade",
        nameKo: "증권 거래소 지분 이용료 (30분 동시호가)",
        nameEn: "Stock exchange fee (30m call auction)",
        flowKo: "도시·사업장 지분 매도자 → 증권 거래소 금고",
        flowEn: "Share seller → Stock exchange vault",
        defaultKo: "50 bp (0.50%, 주인 설정 0%~10%)",
        defaultEn: "50 bp (0.50%, owner range 0%–10%)",
        tuningId: "exchange_share_fee_bp",
        packValue: 50,
        unit: "bp",
        status: "live",
      },
      {
        id: "ex_locker",
        group: "in",
        category: "trade",
        nameKo: "거래소 개인 창고 확장 요금",
        nameEn: "Exchange locker expansion price",
        flowKo: "유저 → 거래소 금고 (기본 200kg, +200kg/칸, 최대 20칸)",
        flowEn: "Player → Exchange vault (base 200kg, +200kg/step, max 20)",
        defaultKo: "칸당 100",
        defaultEn: "100 per step",
        tuningId: "exchange_locker_step_price",
        packValue: 100,
        unit: "minor",
        status: "live",
      },
      {
        id: "ex_order_limit",
        group: "rule",
        category: "trade",
        nameKo: "주문 한도 & 거래 직무 자리",
        nameEn: "Order limit & trade-desk seats",
        flowKo: "기본 10건 + 배치 유닛 ⌊(INT+WIS)/20⌋ (최대 +40)",
        flowEn: "Base 10 + stationed ⌊(INT+WIS)/20⌋ (max +40)",
        defaultKo: "레벨당 5자리 · NPC 자리값 적정가의 100%",
        defaultEn: "5 seats/Lv · NPC desk rent 100% of fair",
        tuningId: "exchange_trade_slots",
        packValue: 5,
        unit: "count",
        status: "live",
      },
      {
        id: "ex_order_life",
        group: "rule",
        category: "trade",
        nameKo: "주문 만료 · 동시호가 주기",
        nameEn: "Order lifetime & auction rounds",
        flowKo: "물자 7일 만료 · 지분 30분 · 환전 1시간",
        flowEn: "Goods 7d expiry · Shares 30m · FX 1h",
        defaultKo: "지분 30분 (1,800,000 ms) · 회차당 10건",
        defaultEn: "Shares 30m (1,800,000 ms) · 10 orders/round",
        tuningId: "business_share_round_ms",
        packValue: 1_800_000,
        unit: "ms",
        status: "live",
      },
    ],
  },
  {
    id: "business",
    titleKo: "건물 · 사업장 (독립 금고·장부)",
    titleEn: "Buildings & Businesses (Independent Vault)",
    subtitleKo: "생산·가공·제작·상업 모든 시설 공통 — 내 시설 이용도 요금 납부",
    subtitleEn: "Shared ledger for every facility — owners pay into their own vault too",
    formulaSummaryKo:
      "매출(판매·임대·서비스) − 비용(수리·재료·인건비·보증금) = 수익 − 소득세(2%) → 정산·배당",
    formulaSummaryEn:
      "Revenue (Sales/Lease/Services) − Costs (Repair/Inputs/Labor) = Profit − Tax (2%) → Settle",
    badgeKo: "CORE · D-548·D-555",
    badgeEn: "CORE · D-548·D-555",
    x: 32,
    y: 256,
    w: 316,
    h: 150,
    accent: "invest",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "매출 (+)",
        labelEn: "Revenue (+)",
        detailKo: "창고 판매금(최소 10개 B2B/소매), 시간당 시설 임대료, 각종 서비스 요금",
        detailEn: "Warehouse sales (min lot 10 / retail), hourly lease rent, service fees",
      },
      {
        sign: "tax",
        labelKo: "수입 소득세 (−2%)",
        labelEn: "Income Tax (−2%)",
        detailKo: "수입 입금 시 나라 소득세(기본 2%, 국고 직행; 나라 자기 건물은 면제)",
        detailEn: "Deducted on inflow at nation income rate (default 2%; exempt for own nation)",
      },
      {
        sign: "minus",
        labelKo: "비용 (−)",
        labelEn: "Costs (−)",
        detailKo: "인건비(일급 + 보증금 30일치, 원천징수), 원재료 매입, 건물 노화 수리 재료·노동",
        detailEn: "Wages (daily + 30d deposit, withheld), raw inputs, building decay repair",
      },
      {
        sign: "equals",
        labelKo: "순수익 → 정산",
        labelEn: "Net Profit → Settle",
        detailKo: "1일 자동/수동 정산: ① 적자 상환 → ② 지급준비금(100%+여유 20%) → ③ 1,000주 지분 배당",
        detailEn:
          "Daily/manual settle: ① Repay deficit → ② Reserve (100%+20% margin) → ③ 1,000-share dividend",
      },
    ],
    items: [
      {
        id: "biz_income_tax",
        group: "tax",
        category: "tax",
        nameKo: "사업장 수입 소득세 (D-555)",
        nameEn: "Business inflow income tax",
        flowKo: "사업장 금고 → 도시 소유 나라 국고 (수입 발생 즉시)",
        flowEn: "Business vault → Nation treasury (on receipt)",
        defaultKo: "나라 소득세율 (미설정 시 거래세 200 bp = 2.00%)",
        defaultEn: "Nation income tax (fallback: trade tax 200 bp = 2.00%)",
        sourceLabel: "nation_taxes.income_tax_bp ?? DEFAULT_TAX_BP",
        status: "live",
      },
      {
        id: "biz_withhold",
        group: "tax",
        category: "labor",
        nameKo: "임금 소득세 원천징수 (D-578)",
        nameEn: "Wage income tax withholding (D-578)",
        flowKo: "사업장 임금 에스크로 → 나라 국고 (유닛은 세후 수령)",
        flowEn: "Wage escrow → Nation treasury (unit receives net)",
        defaultKo: "켬 (1) · 사업장 소득세율과 동일 (기본 2.00%)",
        defaultEn: "On (1) · Same rate as business income tax (default 2.00%)",
        tuningId: "business_wage_withhold_mode",
        packValue: 1,
        unit: "count",
        status: "live",
      },
      {
        id: "biz_wage_base",
        group: "out",
        category: "labor",
        nameKo: "인건비 기준 단가 & 고용주 조정 (N27·N28)",
        nameEn: "Base wage rate & employer range",
        flowKo: "사업장 금고 → 에스크로 → 일꾼 지갑 (하루 1회 선불)",
        flowEn: "Business vault → Escrow → Worker purse (daily prepaid)",
        defaultKo: "효율 1점당 2.0 (2,000밀리) · 고용주 80%~150%",
        defaultEn: "2.0 per efficiency pt (2,000m) · Employer 80%–150%",
        tuningId: "n27_wage_rate",
        packValue: 2000,
        unit: "milli",
        status: "live",
      },
      {
        id: "biz_deposit",
        group: "out",
        category: "labor",
        nameKo: "임금형 보증금 · 경고 (N48)",
        nameEn: "Wage contract deposit & warning",
        flowKo: "사업장 금고 → 에스크로 예치 (적자 시 1주기 후 가동 중지)",
        flowEn: "Business vault → Escrow (halts after 1 deficit cycle)",
        defaultKo: "일급 × 30일치 (7일 미만 경고, 해고 시 잔액 반환)",
        defaultEn: "30× daily wage (warn < 7d, refunded on termination)",
        tuningId: "n48_deposit_days",
        packValue: 30,
        unit: "days",
        status: "live",
      },
      {
        id: "biz_lease",
        group: "in",
        category: "labor",
        nameKo: "임대형 시간당 임대료 (D-479)",
        nameEn: "Facility lease hourly rent (D-479)",
        flowKo: "임차인 지갑 → 사업장 금고 (매시간 선불, 해지 유예 7일)",
        flowEn: "Lessee wallet → Business vault (hourly prepaid, 7d grace)",
        defaultKo: "주기 1시간 (3,600,000 ms) · 요금은 주인 설정",
        defaultEn: "1h cycle (3,600,000 ms) · Rate set by owner",
        tuningId: "n48_rent_cycle_ms",
        packValue: 3_600_000,
        unit: "ms",
        status: "live",
      },
      {
        id: "biz_repair",
        group: "out",
        category: "consume",
        nameKo: "건물 노화 · 수리 비용 (D-171·D-509)",
        nameEn: "Building decay & repair cost",
        flowKo: "화폐 유지비 없음 → 사업장 창고 재료 + 건축 노동 소모",
        flowEn: "No coin upkeep → Warehouse materials + builder labor",
        defaultKo: "미사용 10일→30% 멈춤 · 사용 −7%/일 · 70% 손상 / 30% 정지",
        defaultEn: "Idle 10d→30% floor · Use −7%/day · 70% dmg / 30% stop",
        tuningId: "n50_use_wear",
        packValue: 70,
        unit: "pm",
        status: "live",
      },
      {
        id: "biz_fair_fee",
        group: "rule",
        category: "trade",
        nameKo: "적정가 기준 마진 · 판매 묶음",
        nameEn: "Fair-price margin & sale min lot",
        flowKo: "적정가 = (재료비 + 인건비) × (1 + 마진) ÷ (1 − 세율)",
        flowEn: "Fair = (Inputs + Labor) × (1 + margin) ÷ (1 − tax)",
        defaultKo: "마진 200‰ (20%) · B2B 최소 10개 (소매 행정 Lv2 이하)",
        defaultEn: "200‰ (20%) margin · Min lot 10 (retail ≤ admin Lv2)",
        tuningId: "business_service_fee_pm",
        packValue: 200,
        unit: "pm",
        status: "live",
      },
      {
        id: "biz_settle",
        group: "split",
        category: "invest",
        nameKo: "자동 정산 · 지급준비금 · 지분 배당",
        nameEn: "Auto-settlement, reserve & shares",
        flowKo: "사업장 금고 → 주주 지갑 (지분 1,000주 비례, 가문원 배당은 가문세 공제)",
        flowEn: "Business vault → Shareholders (1,000 shares, house tax if member)",
        defaultKo: "1일 주기 · 준비율 100% (임금 여유 +20%) · 발행 1,000주",
        defaultEn: "Daily · Reserve 100% (+20% wage margin) · 1,000 shares",
        tuningId: "business_settle_period_ms",
        packValue: 86_400_000,
        unit: "ms",
        status: "live",
      },
    ],
  },
  {
    id: "unit",
    titleKo: "유닛 (휴먼 · 사이보그 · 크리쳐)",
    titleEn: "Units (Humans · Cyborgs · Creatures)",
    subtitleKo: "휴먼은 독립 지갑 보유 · 크리쳐/안드로이드/사이보그 유닛은 주인 부담",
    subtitleEn: "Humans hold private purses · Creatures/Androids/Cyborg units paid by owner",
    formulaSummaryKo:
      "소득(세후 임금·배당·증여) − 비용(식량·생필품·주거/숙박·치료·수리·헌금) = 순저축 − 주민세",
    formulaSummaryEn:
      "Income (Net Wage/Dividends/Gifts) − Living (Food/Housing/Care/Repair) = Net − Resident Tax",
    badgeKo: "AGENTS · D-097·D-150",
    badgeEn: "AGENTS · D-097·D-150",
    x: 404,
    y: 256,
    w: 312,
    h: 150,
    accent: "consume",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "소득 (+)",
        labelEn: "Income (+)",
        detailKo: "세후 임금(소득세 2% + 가문세 원천 공제), 사업장·도시 지분 배당, 주인 증여",
        detailEn: "Net wages (after 2% income + house tax), share dividends, owner gifts",
      },
      {
        sign: "minus",
        labelKo: "생활·유지비 (−)",
        labelEn: "Living & Upkeep (−)",
        detailKo: "식량 1/시간 + 생활용품 1/일(사이보그 유닛 ×3), 숙박 1/박·집세, 병원 치료비, 수리·헌금",
        detailEn:
          "Ration 1/h + Goods 1/d (cyborg unit ×3), lodging 1/night or rent, hospital, repair, offering",
      },
      {
        sign: "tax",
        labelKo: "주민세 · 상속세 (−)",
        labelEn: "Resident & Estate Tax (−)",
        detailKo: "거주 재산 기준 주민세(7일 주기, 기본 0‰), 사망 시 지갑 50% 상속세",
        detailEn: "Property-based resident tax (7d, default 0‰); 50% inheritance tax on death",
      },
      {
        sign: "equals",
        labelKo: "미납 시 빚 · 신용 하락",
        labelEn: "Arrears → Debt & Credit",
        detailKo: "주민세 빚 −20점/주기, 유지비 체납 −2점/시간, 노숙 회복 10%",
        detailEn: "Resident debt −20/cycle, upkeep arrears −2/h, homeless recovery 10%",
      },
    ],
    items: [
      {
        id: "unit_necessities",
        group: "out",
        category: "consume",
        nameKo: "필수 생필품 소비 (D-150)",
        nameEn: "Mandatory necessities upkeep",
        flowKo: "유닛/주인 창고 → 소멸 계정 (정시 경계마다)",
        flowEn: "Unit/Owner storage → Consumed (hourly boundary)",
        defaultKo: "식량(ration) 1개/시간 · 생활용품 1개/24시간 (미납 효율 70%)",
        defaultEn: "Ration 1/hour · Daily goods 1/24h (unpaid eff. 70%)",
        sourceLabel: "content/core/necessities.json",
        status: "live",
      },
      {
        id: "unit_cyborg_upkeep",
        group: "out",
        category: "consume",
        nameKo: "사이보그 유닛 유지비 배율 (N46)",
        nameEn: "Cyborg unit upkeep multiplier",
        flowKo: "일반 유닛(100%) 대비 생필품 요구 배수",
        flowEn: "Necessities multiplier vs normal unit (100%)",
        defaultKo: "3,000‰ (3.0배)",
        defaultEn: "3,000‰ (3.0×)",
        tuningId: "n46_upkeep",
        packValue: 3000,
        unit: "pm",
        status: "live",
      },
      {
        id: "unit_lodging",
        group: "out",
        category: "consume",
        nameKo: "숙박비 · 주거 집세 (D-555·D-591)",
        nameEn: "Lodging fee & residence rent",
        flowKo: "유닛 사유 지갑 → 숙소/주거 사업장 금고",
        flowEn: "Human purse → Lodging/housing business vault",
        defaultKo: "숙박 1/박 · 집세 주기 1일 (층당 정원 4명, 최대 5층)",
        defaultEn: "1/night lodging · Daily rent cycle (4/floor, max 5 floors)",
        tuningId: "lodging_fee_per_night",
        packValue: 1,
        unit: "minor",
        status: "live",
      },
      {
        id: "unit_hospital",
        group: "out",
        category: "consume",
        nameKo: "병원 치료비 (N55)",
        nameEn: "Hospital treatment fee (N55)",
        flowKo: "유닛/주인 지갑 → 병원 사업장 금고 (자율 치료 상한 지갑 50%)",
        flowEn: "Unit/Owner wallet → Hospital vault (auto-care cap 50% purse)",
        defaultKo: "남은 치유일 × 200 × (1 + 50% × 병원 Lv)",
        defaultEn: "Days left × 200 × (1 + 50% × hospital Lv)",
        tuningId: "n55_hospital_cost_day",
        packValue: 200,
        unit: "minor",
        status: "live",
      },
      {
        id: "unit_organ_repair",
        group: "out",
        category: "consume",
        nameKo: "인공장기 마모 · 수리비 (N38)",
        nameEn: "Cyborg organ wear & repair (N38)",
        flowKo: "정시마다 내구도 −1 → 수리 시 화폐 지출",
        flowEn: "−1 durability/hour → Coin repair cost",
        defaultKo: "내구도 1점당 100 (최대 내구도 Lv1 −30%~Lv5 −10% 감소)",
        defaultEn: "100 per durability pt (max loss Lv1 −30% to Lv5 −10%)",
        tuningId: "n38_organ_repair_cost",
        packValue: 100,
        unit: "minor",
        status: "live",
      },
      {
        id: "unit_resident_tax",
        group: "tax",
        category: "tax",
        nameKo: "주민세 (D-579·D-581 재산 기준)",
        nameEn: "Resident tax (property-based)",
        flowKo: "거주 유닛(집 몫) + 주인(사업장 몫) → 도시 운영비 금고 / 국고",
        flowEn: "Resident (home share) + Owner (biz share) → City fund / Treasury",
        defaultKo: "기본 0‰ (7일 주기, 국세 몫 0‰, 건물 감가 1‰/일·바닥 30%)",
        defaultEn: "Default 0‰ (7d cycle, 0‰ national split, bldg −1‰/d floor 30%)",
        tuningId: "nation_resident_tax_pm",
        packValue: 0,
        unit: "pm",
        status: "live",
      },
      {
        id: "unit_credit",
        group: "rule",
        category: "tax",
        nameKo: "신용 점수 (D-581·D-584)",
        nameEn: "Credit score (D-581·D-584)",
        flowKo: "0~1,000점 (소속 +5/일 상한 300, 가동 사업장 +10/일)",
        flowEn: "0–1,000 pts (tenure +5/d cap 300, active biz +10/d)",
        defaultKo: "시작 100점 (주민세 빚 −20 · 적자 −10 · 체납 −2/h · 쿠데타 −100)",
        defaultEn: "Start 100 (tax debt −20 · deficit −10 · upkeep −2/h · coup −100)",
        tuningId: "credit_start",
        packValue: 100,
        unit: "count",
        status: "live",
      },
    ],
  },
  {
    id: "services",
    titleKo: "항구 · 물류 · 신전 · 연구소",
    titleEn: "Harbor · Logistics · Temple · Biotech",
    subtitleKo: "특수 서비스 시설별 단가와 돈의 귀착(사업장 금고 vs 소각)",
    subtitleEn: "Specialized service fees and destinations (business vault vs burn)",
    formulaSummaryKo: "서비스 이용료(정박·교역·조선·운반·헌금·연구) → 시설 금고(소득세 2%) 또는 시스템 소각",
    formulaSummaryEn: "Service Fees (Berth/Dock/Shipyard/Haul/Temple/Lab) → Vault (2% tax) or System Burn",
    badgeKo: "SERVICES · D-547·D-576",
    badgeEn: "SERVICES · D-547·D-576",
    x: 772,
    y: 256,
    w: 316,
    h: 150,
    accent: "consume",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "항구·조선·물류 (+)",
        labelEn: "Harbor, Shipyard & Haul (+)",
        detailKo: "정박 10/일, 교역부두 5/시간(초과 ×5), 배 수리 50·보관 20/일, 운반 100kg×10칸 단위",
        detailEn: "Berth 10/d, trade dock 5/h (×5 overstay), ship repair 50, storage 20/d, haul 100kg×10c",
      },
      {
        sign: "plus",
        labelKo: "신전·생명과학 (+)",
        labelEn: "Temple & Biotech (+)",
        detailKo: "헌금 50/신앙, 환생 10,000, 신격화 20,000, 유전자 변환 1,000, 인큐베이터 5,000",
        detailEn: "Offering 50/faith, rebirth 10,000, deify 20,000, gene 1,000, incubator 5,000",
      },
      {
        sign: "tax",
        labelKo: "시설 귀속 / 소각",
        labelEn: "Vault Tax / Burn",
        detailKo: "민간/NPC 사업장 서비스는 금고 입금+소득세 2%, 시스템 의식(환생·융합)은 소각",
        detailEn: "Facility services enter vault with 2% tax; system rituals burn coins",
      },
    ],
    items: [
      {
        id: "srv_harbor_berth",
        group: "in",
        category: "consume",
        nameKo: "정박장 일일 정박료 (D-547)",
        nameEn: "Harbor daily berthing fee",
        flowKo: "선주 지갑 → 정박장 사업장 금고 (체납 3일 한도)",
        flowEn: "Boat owner → Harbor business vault (3d arrears limit)",
        defaultKo: "하루 10 (레벨당 2자리, 배 유지비 일반 유닛의 30%)",
        defaultEn: "10/day (2 berths/Lv, boat upkeep 30% of unit)",
        tuningId: "harbor_fee_per_day",
        packValue: 10,
        unit: "minor",
        status: "live",
      },
      {
        id: "srv_trade_dock",
        group: "in",
        category: "trade",
        nameKo: "교역 부두 시간 요금",
        nameEn: "Trade dock hourly fee",
        flowKo: "선주 지갑 → 교역 부두 사업장 금고 (최대 24시간 구매)",
        flowEn: "Boat owner → Trade dock vault (up to 24h)",
        defaultKo: "시간당 5 (초과 체류 시 ×5배 = 25/시간)",
        defaultEn: "5/hour (overstay penalty ×5 = 25/hour)",
        tuningId: "trade_dock_fee_per_hour",
        packValue: 5,
        unit: "minor",
        status: "live",
      },
      {
        id: "srv_shipyard",
        group: "in",
        category: "consume",
        nameKo: "조선소 수리 · 보관 · 건조 주문",
        nameEn: "Shipyard repair, storage & build",
        flowKo: "선주 지갑 → 조선소 금고 (보관료 3일 미납 시 압류)",
        flowEn: "Boat owner → Shipyard vault (impound after 3d arrears)",
        defaultKo: "수리 50 · 도크 보관 20/일(24h 무료) · 건조 주문 외주×300%",
        defaultEn: "Repair 50 · Storage 20/d (24h free) · Build order 300%",
        tuningId: "shipyard_repair_fee",
        packValue: 50,
        unit: "minor",
        status: "live",
      },
      {
        id: "srv_haul",
        group: "in",
        category: "trade",
        nameKo: "물류센터 운반 대행 단위 (D-576)",
        nameEn: "Logistics haul service unit",
        flowKo: "의뢰인 → 물류센터 금고 (⌈무게÷100kg⌉ × ⌈거리÷10칸⌉ × 단가)",
        flowEn: "Client → Logistics vault (⌈wt÷100kg⌉ × ⌈dist÷10c⌉ × rate)",
        defaultKo: "단위 무게 100,000g (100kg) × 거리 10칸",
        defaultEn: "Unit 100,000g (100kg) × 10 cells",
        tuningId: "business_haul_unit_g",
        packValue: 100_000,
        unit: "grams",
        status: "live",
      },
      {
        id: "srv_temple_offering",
        group: "in",
        category: "consume",
        nameKo: "신전 헌금 · 환생 · 신격화 (D-311)",
        nameEn: "Temple offering, rebirth & deify",
        flowKo: "플레이어 → 신전/소각 (신앙 문턱: 환생 50 · 신격화 100)",
        flowEn: "Player → Temple/Sink (faith req: rebirth 50, deify 100)",
        defaultKo: "헌금 50/신앙 · 환생 10,000 · 신격화 20,000",
        defaultEn: "Offering 50/faith · Rebirth 10,000 · Deify 20,000",
        tuningId: "d444_offering_per_faith",
        packValue: 50,
        unit: "minor",
        status: "live",
      },
      {
        id: "srv_biotech",
        group: "out",
        category: "monetary",
        nameKo: "생명과학 연구소 · 사이보그 융합 (N46·N47)",
        nameEn: "Biotech lab & cyborg fusion",
        flowKo: "플레이어 지갑 → 시설/소각 (+티타늄 50 · 칩 20)",
        flowEn: "Player wallet → Lab/Burn (+50 titanium, +20 chips)",
        defaultKo: "유전자 변환 1,000 · 인큐베이터 5,000 · 융합 5,000",
        defaultEn: "Gene convert 1,000 · Incubator 5,000 · Fusion 5,000",
        tuningId: "n46_currency",
        packValue: 5000,
        unit: "minor",
        status: "live",
      },
    ],
  },
  {
    id: "house_player",
    titleKo: "플레이어 · 가문 (금고 & 지갑)",
    titleEn: "Player & House (Wallet & Vault)",
    subtitleKo: "사이보그 본체 지갑 + 가문 공동 금고(가문세·기부·배당)",
    subtitleEn: "Cyborg personal wallet + House shared vault (house tax, gifts, dividends)",
    formulaSummaryKo: "수입(지원금·배당·가문세·기부) − 비용(가문 도시세·구인·건설·마을·출자·증여) = 순자산",
    formulaSummaryEn:
      "Inflow (Grant/Dividends/House Tax/Gifts) − Outflow (City Tax/Recruit/Build/Invest) = Net",
    badgeKo: "OWNER · D-565·D-574",
    badgeEn: "OWNER · D-565·D-574",
    x: 32,
    y: 504,
    w: 500,
    h: 146,
    accent: "invest",
    status: "live",
    equation: [
      {
        sign: "plus",
        labelKo: "유입 (+)",
        labelEn: "Inflows (+)",
        detailKo: "정착 지원금(72~108), 사업장·도시 지분 배당, 가문세(최대 30%), 가문원 기부, 현상금",
        detailEn: "Settlement grant (72–108), business/city dividends, house tax (≤30%), donations, bounties",
      },
      {
        sign: "minus",
        labelKo: "투자·운영 지출 (−)",
        labelEn: "Capex & Ops (−)",
        detailKo: "구인(50×Lv+2×초과스탯), 건물 건설·증축, 사업장 출자/적자 보전, 유닛 증여, 마을 5,000",
        detailEn:
          "Recruit (50×Lv+2×extra), building/floor build, biz equity/deficit fill, gifts, village 5,000",
      },
      {
        sign: "tax",
        labelKo: "가문 도시세 · 주민세 (−)",
        labelEn: "House City & Resident Tax (−)",
        detailKo: "소속 도시에 가문 도시세(7일 주기), 보유 사업장 몫 주민세, 귀화비 100",
        detailEn: "House city tax to home city (7d), business resident tax, naturalization 100",
      },
    ],
    items: [
      {
        id: "hp_house_tax",
        group: "in",
        category: "tax",
        nameKo: "가문세 (가문 내부 회비, D-574)",
        nameEn: "House tax (internal dues)",
        flowKo: "가문원 임금·사업장 배당 → 가문 금고 (가문장 설정)",
        flowEn: "Member wage & biz dividends → House vault",
        defaultKo: "플레이어 기본 0‰ · 상한 300‰ (30%) · NPC 가문 100‰ (10%)",
        defaultEn: "Player default 0‰ · Cap 300‰ (30%) · NPC house 100‰ (10%)",
        tuningId: "house_tax_max_pm",
        packValue: 300,
        unit: "pm",
        status: "live",
      },
      {
        id: "hp_house_city_tax",
        group: "tax",
        category: "tax",
        nameKo: "가문 도시세 (소속 도시 납부)",
        nameEn: "House city tax",
        flowKo: "가문 금고 → 소속 도시 국고 (미납 시 빚·가문장 신용 하락)",
        flowEn: "House vault → Home city treasury (debt & leader credit drop)",
        defaultKo: "기본 0 (시장/국가원수 설정, 주기 7일: 1·3·7·14일 선택)",
        defaultEn: "Default 0 (mayor/leader sets, 7d cycle: 1/3/7/14d)",
        sourceLabel: "HOUSE_CITY_TAX_DEFAULT_PERIOD_DAYS = 7",
        status: "live",
      },
      {
        id: "hp_recruit",
        group: "out",
        category: "labor",
        nameKo: "행정 건물 휴먼 구인 비용 (N45·D-469)",
        nameEn: "Admin human recruitment cost",
        flowKo: "플레이어 지갑 → 소각/행정 (12시간마다 카드 갱신)",
        flowEn: "Player wallet → Sink/Admin (cards refresh every 12h)",
        defaultKo: "등급 × 50 + (최소 초과 토탈 스탯) × 2",
        defaultEn: "Level × 50 + (stat sum above min) × 2",
        tuningId: "n45_cost_per_level",
        packValue: 50,
        unit: "minor",
        status: "live",
      },
      {
        id: "hp_village",
        group: "out",
        category: "monetary",
        nameKo: "가문 마을 세우기 · 가문 창설",
        nameEn: "Found house village / house",
        flowKo: "가문장 지갑 → 소각 (새 마을 주거 8칸)",
        flowEn: "House leader → Burn (new village 8 housing)",
        defaultKo: "가문 창설 무료 (D-565) · 가문 마을 5,000",
        defaultEn: "Found house free (D-565) · House village 5,000",
        tuningId: "house_village_cost",
        packValue: 5000,
        unit: "minor",
        status: "live",
      },
      {
        id: "hp_npc_ruling",
        group: "split",
        category: "invest",
        nameKo: "NPC 지배 가문 금고 환류·배당 (D-576)",
        nameEn: "NPC ruling house vault return & spend",
        flowKo: "지배 가문 금고 → 국고 환류 30~90% → 꺼내기 50% (배당 30%·건설 30%)",
        flowEn: "Ruling vault → Treasury 30–90% → Withdraw 50% (30% div, 30% build)",
        defaultKo: "국고 환류 300~900‰ · 꺼내기 500‰ · 배당 300‰ · 건설 300‰",
        defaultEn: "Return 300–900‰ · Take 500‰ · Dividend 300‰ · Build 300‰",
        tuningId: "house_npc_vault_take_pm",
        packValue: 500,
        unit: "pm",
        status: "live",
      },
      {
        id: "hp_coup_fail",
        group: "out",
        category: "monetary",
        nameKo: "군사 쿠데타 실패 비용",
        nameEn: "Failed military coup cost",
        flowKo: "주도자 → 소각 (실패 시 만족도 −20 · 신용 −100)",
        flowEn: "Initiator → Burn (satisfaction −20 · credit −100)",
        defaultKo: "50,000",
        defaultEn: "50,000",
        tuningId: "gov_coup_fail_cost",
        packValue: 50_000,
        unit: "minor",
        status: "live",
      },
    ],
  },
  {
    id: "planned",
    titleKo: "기획 예정 (미구현 · 출시 후 잠금)",
    titleEn: "Planned Systems (Post-Launch / Pending)",
    subtitleKo: "44_Economy.md에 확정됐으나 코드 미연결·출시 뒤 개방 예정 요소",
    subtitleEn: "Specified in 44_Economy.md but not yet active in server runtime",
    formulaSummaryKo: "은행(예금·담보대출) · 국가 채권 · 유닛/운송 경매장 · 필지 매매/토지세 · 테라코인 거래",
    formulaSummaryEn:
      "Bank (Deposit/Loans) · Sovereign Bonds · Unit/Vehicle Auctions · Land Tax · Terracoin FX",
    badgeKo: "ROADMAP · 44_Economy",
    badgeEn: "ROADMAP · 44_Economy",
    x: 588,
    y: 504,
    w: 500,
    h: 146,
    accent: "trade",
    status: "planned",
    equation: [
      {
        sign: "plus",
        labelKo: "은행·채권 (D-138·D-130)",
        labelEn: "Bank & Bonds (D-138·D-130)",
        detailKo: "전액 지급준비 예금 + 담보 대출 + 신용도 기반 부분 준비금 · 국가 채권(30/90/180일)",
        detailEn: "100%-reserve deposits + collateral loans + credit reserve · Bonds (30/90/180d)",
      },
      {
        sign: "plus",
        labelKo: "유닛·운송·필지 시장",
        labelEn: "Unit, Vehicle & Plot Markets",
        detailKo: "유닛·운송 공개 경매(즉시 구매), 필지 경매·1:1 협상 + 토지세/재산세",
        detailEn: "Unit/vehicle public auctions (buyout), plot auction/1:1 + land/property tax",
      },
      {
        sign: "split",
        labelKo: "테라코인 · 법인 상장",
        labelEn: "Terracoin & Corporate IPO",
        detailKo: "유저 간 테라코인↔세력 화폐 동시호가(현금화 불가), 복수 시설 회사 상장(출시 뒤 잠금)",
        detailEn: "P2P Terracoin↔Currency auction (no cash-out), multi-facility corporate IPO (post-launch)",
      },
    ],
    items: [
      {
        id: "plan_bank",
        group: "rule",
        category: "invest",
        nameKo: "은행 예금 · 담보 대출 (D-138)",
        nameEn: "Bank deposits & collateral loans",
        flowKo: "예금 전액 준비 + 담보 잠금 대출(미상환 시 경매 처분) · 보험 없음(D-151)",
        flowEn: "Full-reserve deposits + locked-collateral loans (auction default) · No insurance",
        defaultKo: "이율·담보 비율 미정 (신용 점수 기반)",
        defaultEn: "Rate & LTV TBD (credit-score driven)",
        sourceLabel: "44_Economy.md §5 (E16)",
        status: "planned",
      },
      {
        id: "plan_bonds",
        group: "rule",
        category: "invest",
        nameKo: "국가 채권 (D-130)",
        nameEn: "Sovereign bonds (D-130)",
        flowKo: "도시 5개+ 연합 국가 발행 → 투자자 이자 (미지급 시 부도·이탈)",
        flowEn: "Issued by 5+ city nations → Investor interest (default triggers collapse)",
        defaultKo: "만기 30·90·180일 (신용등급별 이자)",
        defaultEn: "30/90/180-day terms (credit-rated yield)",
        sourceLabel: "44_Economy.md §6",
        status: "planned",
      },
      {
        id: "plan_unit_market",
        group: "rule",
        category: "trade",
        nameKo: "유닛·운송 수단 경매장 (D-242·D-271)",
        nameEn: "Unit & vehicle auction houses",
        flowKo: "종류별 경매 + 즉시 구매가 (1:1 협상 금지, 수수료·세금→국고)",
        flowEn: "Public auction + buyout by type (no 1:1 trade, fees/tax→treasury)",
        defaultKo: "수수료 미정 (휴먼 지갑은 이적 시 동반 이동)",
        defaultEn: "Fee TBD (human purse transfers with unit)",
        sourceLabel: "44_Economy.md §7 (E23·E24)",
        status: "planned",
      },
      {
        id: "plan_land_tax",
        group: "tax",
        category: "tax",
        nameKo: "필지 거래 · 토지세 · 관세 · 입장세 · 전쟁세",
        nameEn: "Plot trading, land/customs/entry/war taxes",
        flowKo: "필지 = 평가액 × 도시 세율 (1:1 협상 감시), 7종 조세 확장",
        flowEn: "Plot = appraisal × city rate; remaining of 7 tax types",
        defaultKo: "세율 0%~상한 없음 (정부 설정)",
        defaultEn: "0%–no system cap (government-set)",
        sourceLabel: "44_Economy.md §4·§8 (E32)",
        status: "planned",
      },
      {
        id: "plan_terracoin",
        group: "rule",
        category: "trade",
        nameKo: "테라코인 ↔ 세력 화폐 동시호가 (D-7006)",
        nameEn: "Terracoin ↔ Faction currency FX",
        flowKo: "유저 간 동시호가 거래 (NPC는 국고 잔액 한도 내 매수, 현금화 불가)",
        flowEn: "P2P call auction (NPC buys from treasury only, no cash-out)",
        defaultKo: "동시호가 1시간 기준 (환전 규칙 준용)",
        defaultEn: "1h call auction (follows FX rules)",
        sourceLabel: "44_Economy.md §1·§3 (D-241)",
        status: "planned",
      },
      {
        id: "plan_currency_stages",
        group: "rule",
        category: "monetary",
        nameKo: "통화 4단계 전환 · 닉슨 쇼크 (D-131)",
        nameEn: "4-stage currency regime & Nixon shock",
        flowKo: "0 빌려쓰기 → 1 주화(주조 손실 10%) → 2 준비금 지폐 → 3 신용 통화",
        flowEn: "0 Borrow → 1 Coinage (10% mint loss) → 2 Reserve Note → 3 Fiat",
        defaultKo: "전환 유예 7일 · 직후 3일간 환전 수수료 ×2배",
        defaultEn: "7d grace · 2× FX fee for 3 days after switch",
        sourceLabel: "44_Economy.md §2 (E3)",
        status: "partial",
      },
    ],
  },
];

/** 모식도 주체 간 화살표 목록 */
export const ECONOMY_FLOW_EDGES: readonly EconomyFlowEdge[] = [
  // 중앙은행 ↔ 정부
  {
    id: "e_cb_gov_mint",
    from: "central_bank",
    to: "government",
    category: "monetary",
    labelKo: "초기·물가 발행",
    labelEn: "Mint (init / CPI)",
    defaultTagKo: "인구×200×7 · 일±3%",
    defaultTagEn: "Pop×200×7 · ±3%/d",
    bend: -24,
    status: "live",
  },
  {
    id: "e_gov_cb_burn",
    from: "government",
    to: "central_bank",
    category: "monetary",
    labelKo: "발행 이자·긴축 소각",
    labelEn: "Interest & Tightening Burn",
    defaultTagKo: "일 0.01% 우선 소각",
    defaultTagEn: "0.01%/d burn first",
    bend: -24,
    status: "live",
  },
  // 거래소 ↔ 정부
  {
    id: "e_ex_gov_tradetax",
    from: "exchange",
    to: "government",
    category: "tax",
    labelKo: "거래세 · 거래소 소득세",
    labelEn: "Trade Tax & Income Tax",
    defaultTagKo: "2.00% (200bp)",
    defaultTagEn: "2.00% (200bp)",
    bend: -22,
    status: "live",
  },
  // 사업장 ↔ 정부
  {
    id: "e_biz_gov_tax",
    from: "business",
    to: "government",
    category: "tax",
    labelKo: "사업장·임금 원천 소득세",
    labelEn: "Biz & Withheld Income Tax",
    defaultTagKo: "2.00% (200bp)",
    defaultTagEn: "2.00% (200bp)",
    bend: -26,
    labelT: 0.48,
    status: "live",
  },
  // 사업장 ↔ 유닛 (임금 + 소비)
  {
    id: "e_biz_unit_wage",
    from: "business",
    to: "unit",
    category: "labor",
    labelKo: "세후 임금 (보증금 30일)",
    labelEn: "Net Wage (30d escrow)",
    defaultTagKo: "단가 2.0 × 효율",
    defaultTagEn: "Rate 2.0 × eff.",
    bend: -26,
    status: "live",
  },
  {
    id: "e_unit_biz_buy",
    from: "unit",
    to: "business",
    category: "consume",
    labelKo: "식량·생필품·집세·숙박",
    labelEn: "Food, Goods & Housing",
    defaultTagKo: "식량 1/h · 숙박 1/박",
    defaultTagEn: "Food 1/h · Stay 1/n",
    bend: -26,
    status: "live",
  },
  // 유닛 ↔ 정부 (주민세 · 상속세)
  {
    id: "e_unit_gov_tax",
    from: "unit",
    to: "government",
    category: "tax",
    labelKo: "주민세 · 상속세",
    labelEn: "Resident & Estate Tax",
    defaultTagKo: "주민 0‰(7d) · 상속 50%",
    defaultTagEn: "Res 0‰(7d) · Est 50%",
    bend: 22,
    status: "live",
  },
  // 유닛 ↔ 특수 시설 (병원 · 신전 · 항구)
  {
    id: "e_unit_srv_fees",
    from: "unit",
    to: "services",
    category: "consume",
    labelKo: "치료·헌금·정박·수리",
    labelEn: "Hospital, Temple, Harbor",
    defaultTagKo: "병원 200/d · 헌금 50",
    defaultTagEn: "Care 200/d · Offer 50",
    bend: -20,
    status: "live",
  },
  // 특수 시설 → 정부 (소득세)
  {
    id: "e_srv_gov_tax",
    from: "services",
    to: "government",
    category: "tax",
    labelKo: "서비스 사업장 소득세",
    labelEn: "Service Biz Income Tax",
    defaultTagKo: "2.00% (200bp)",
    defaultTagEn: "2.00% (200bp)",
    bend: 32,
    labelT: 0.56,
    status: "live",
  },
  // 사업장 ↔ 거래소 (물건 매매 · 이용료)
  {
    id: "e_biz_ex_trade",
    from: "business",
    to: "exchange",
    category: "trade",
    labelKo: "물자·지분·환전 이용료",
    labelEn: "Goods, Share & FX Fees",
    defaultTagKo: "각 0.50% (50bp)",
    defaultTagEn: "0.50% (50bp) each",
    bend: -76,
    labelT: 0.52,
    status: "live",
  },
  // 특수 시설 ↔ 거래소 (물류센터 운반)
  {
    id: "e_srv_ex_haul",
    from: "services",
    to: "exchange",
    category: "trade",
    labelKo: "물류 운반 · 부두 연계",
    labelEn: "Haul & Port Link",
    defaultTagKo: "100kg×10칸 · 부두 5/h",
    defaultTagEn: "100kg×10c · Dock 5/h",
    bend: 20,
    status: "live",
  },
  // 사업장 ↔ 플레이어·가문 (지분 배당 / 출자)
  {
    id: "e_biz_hp_div",
    from: "business",
    to: "house_player",
    category: "invest",
    labelKo: "사업장 지분 배당",
    labelEn: "Business Dividends",
    defaultTagKo: "1일 정산 · 1,000주",
    defaultTagEn: "Daily · 1,000 shares",
    bend: -34,
    status: "live",
  },
  {
    id: "e_hp_biz_cap",
    from: "house_player",
    to: "business",
    category: "invest",
    labelKo: "출자 · 적자 보전 · 임대료",
    labelEn: "Capital, Deficit & Lease",
    defaultTagKo: "건설 재료 · 임대 1h",
    defaultTagEn: "Build mats · 1h lease",
    bend: -34,
    status: "live",
  },
  // 유닛 ↔ 플레이어·가문 (가문세 / 증여)
  {
    id: "e_unit_hp_htax",
    from: "unit",
    to: "house_player",
    category: "tax",
    labelKo: "가문세 (임금 공제)",
    labelEn: "House Tax (on wage)",
    defaultTagKo: "상한 30% · NPC 10%",
    defaultTagEn: "Cap 30% · NPC 10%",
    bend: -24,
    status: "live",
  },
  {
    id: "e_hp_unit_gift",
    from: "house_player",
    to: "unit",
    category: "labor",
    labelKo: "구인 · 증여 · 부양",
    labelEn: "Recruit, Gift & Support",
    defaultTagKo: "구인 50×Lv+2×스탯",
    defaultTagEn: "Recruit 50×Lv+2×stat",
    bend: -24,
    status: "live",
  },
  // 정부 ↔ 플레이어·가문 (배당·지원금 / 가문 도시세·귀화비)
  {
    id: "e_gov_hp_div",
    from: "government",
    to: "house_player",
    category: "invest",
    labelKo: "도시 배당 · 지원금 · 현상금",
    labelEn: "City Dividends, Grant, Bounty",
    defaultTagKo: "7일 배당 · 지원 72~108",
    defaultTagEn: "7d div · Grant 72–108",
    bend: 165,
    labelT: 0.72,
    status: "live",
  },
  {
    id: "e_hp_gov_tax",
    from: "house_player",
    to: "government",
    category: "tax",
    labelKo: "가문 도시세 · 귀화비",
    labelEn: "House City Tax & Visa",
    defaultTagKo: "7일 주기 · 귀화 100",
    defaultTagEn: "7d cycle · Visa 100",
    bend: -185,
    labelT: 0.25,
    status: "live",
  },
  // 플레이어·가문 → 중앙은행(소각)
  {
    id: "e_hp_cb_sink",
    from: "house_player",
    to: "central_bank",
    category: "monetary",
    labelKo: "마을·융합·환생·쿠데타 소각",
    labelEn: "Village/Fusion/Rebirth Sinks",
    defaultTagKo: "5,000 ~ 50,000",
    defaultTagEn: "5,000 – 50,000",
    bend: -120,
    labelT: 0.5,
    status: "live",
  },
  // 기획 예정 ↔ 플레이어·가문 / 거래소
  {
    id: "e_hp_plan_future",
    from: "house_player",
    to: "planned",
    category: "invest",
    labelKo: "은행 대출 · 채권 · 필지",
    labelEn: "Loans, Bonds & Plots",
    defaultTagKo: "기획 예정 (44_Economy)",
    defaultTagEn: "Planned (44_Economy)",
    bend: 0,
    status: "planned",
  },
  {
    id: "e_ex_plan_future",
    from: "exchange",
    to: "planned",
    category: "trade",
    labelKo: "유닛 경매 · 테라코인 · IPO",
    labelEn: "Unit Auction, TC & IPO",
    defaultTagKo: "출시 뒤 잠금",
    defaultTagEn: "Post-launch",
    bend: 115,
    labelT: 0.55,
    status: "planned",
  },
];

/** 숫자 튜닝 값을 단위에 맞게 읽기 좋은 문자열로 바꾼다 */
export function formatEconomyValue(value: number, unit: ValueUnit | undefined, ko: boolean): string {
  const num = new Intl.NumberFormat(ko ? "ko-KR" : "en-US").format(value);
  switch (unit) {
    case "bp": {
      const pct = (value / 100).toFixed(2).replace(/\.00$/, "");
      return `${num} bp (${pct}%)`;
    }
    case "pm": {
      const pct = (value / 10).toFixed(1).replace(/\.0$/, "");
      return `${num}‰ (${pct}%)`;
    }
    case "ms": {
      if (value >= 86_400_000 && value % 86_400_000 === 0) {
        const d = value / 86_400_000;
        return ko ? `${d}일 (${num} ms)` : `${d}d (${num} ms)`;
      }
      if (value >= 3_600_000 && value % 3_600_000 === 0) {
        const h = value / 3_600_000;
        return ko ? `${h}시간 (${num} ms)` : `${h}h (${num} ms)`;
      }
      if (value >= 60_000 && value % 60_000 === 0) {
        const min = value / 60_000;
        return ko ? `${min}분 (${num} ms)` : `${min}m (${num} ms)`;
      }
      return `${num} ms`;
    }
    case "grams": {
      if (value >= 1000 && value % 1000 === 0) {
        const kg = new Intl.NumberFormat(ko ? "ko-KR" : "en-US").format(value / 1000);
        return `${kg} kg (${num} g)`;
      }
      return `${num} g`;
    }
    case "days":
      return ko ? `${num}일` : `${num}d`;
    case "milli":
      return `${(value / 1000).toFixed(2).replace(/\.00$/, "")} (${num}m)`;
    case "pct":
      return `${num}%`;
    case "count":
    case "minor":
    case "raw":
    default:
      return num;
  }
}

export interface FlatEconomyRow {
  readonly actorId: ActorId;
  readonly actorTitleKo: string;
  readonly actorTitleEn: string;
  readonly item: EconomyLineItem;
}

/** 검색 표용 평탄화 목록 */
export function flattenEconomyItems(): readonly FlatEconomyRow[] {
  const rows: FlatEconomyRow[] = [];
  for (const actor of ECONOMY_ACTORS) {
    for (const item of actor.items) {
      rows.push({
        actorId: actor.id,
        actorTitleKo: actor.titleKo,
        actorTitleEn: actor.titleEn,
        item,
      });
    }
  }
  return rows;
}
