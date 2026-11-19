// tRPC 요청 맥락 — 프로시저가 읽는 값. 요청마다 새로 만든다(src/trpc/createContext.ts).
// 이 타입은 AppRouter 타입에 들어가 게임 앱의 타입 검사에도 쓰인다.
// 그래서 Node 전용 타입(fastify, pg, drizzle, better-auth 등)을 여기에 직접 넣지 않는다.
// 넣으면 기기 코드에서 Node 전역(process, Buffer)이 타입 오류 없이 보이게 된다 — scripts/check-boundaries.mjs가 잡는다.
import type { FactionIdentityServices } from "../factionIdentity/services.ts";
import type { OpsServices } from "../ops/services.ts";
import type { PlacementService } from "../world/placementService.ts";
import type { TerritoryPlanetView } from "@terra/shared/territoryApi";
import type { Role, UserSettings } from "@terra/shared";
import type { DashboardCardsResponse } from "@terra/shared/dashboard";
import type {
  EconomyCatalogResponse,
  EconomyCityNamesResponse,
  EconomyExchangeResponse,
  EconomyHoldingsResponse,
  EconomyOrdersResponse,
  EconomyProductionResponse,
  MarketBookResponse,
  MarketCitiesResponse,
  MarketItemsResponse,
} from "@terra/shared/economy";
import type { InboxListResponse, SummaryGetResponse } from "@terra/shared/inbox";
import type {
  CyborgCreationResponse,
  CyborgNameCheckResponse,
  CyborgStatusResponse,
} from "@terra/shared/cyborg";
import type { CyborgGetResponse, UnitsListResponse } from "@terra/shared/roster";
import type { UnitGuideResponse } from "@terra/shared/unitGuide";
import type { FactionOverviewResponse } from "@terra/shared/faction";
import type { MailListResponse } from "@terra/shared/mail";
import type { TuningExportResponse, TuningHistoryResponse, TuningListResponse } from "@terra/shared/tuning";
import type { SkillEditorServices } from "../contentEdit/services.ts";
import type { ItemEditorServices } from "../itemEdit/services.ts";
import type { HoldingsReadServices } from "../holdings/reads.ts";
import type { VitalsReadServices } from "../vitals/reads.ts";
import type { RankingServices } from "../ranking/services.ts";
import type { BuildingEditorServices } from "../buildingEdit/services.ts";
import type { CreatureEditorServices } from "../creatureEdit/services.ts";
import type { NationEditorServices } from "../nationEdit/services.ts";
import type { FormulaListResponse } from "@terra/shared/formula";
import type { BattleLabShared } from "../battleLab/services.ts";
import type { Database } from "../db/client.ts";
import type { LaborScreenServices } from "../labor/views.ts";
import type { FacilityScreenServices } from "../facilities/screen.ts";
import type { BalanceDuelsInput, BalanceDuelsResponse, BalanceTableResponse } from "@terra/shared/balance";
import type { BattleReplayDemoResponse } from "@terra/shared/battleReplay";
import type { RecruitBoardResponse } from "@terra/shared/recruit";
import type { FusionOverviewResponse } from "@terra/shared/fusion";
import type { TempleOverviewResponse } from "@terra/shared/temple";
import type { HospitalOverviewResponse } from "@terra/shared/hospital";
import type { RuinsOverviewResponse } from "@terra/shared/ruins";
import type { WorldCitiesResponse, WorldPositionResponse } from "@terra/shared/worldMap";
import type { MapUnitReads } from "../worldMap/mapUnits.ts";
import type { TravelReads } from "../worldMap/travelReads.ts";
import type { GovernmentReads } from "../government/reads.ts";
import type { NaturalizationReads } from "../citizenship/attach.ts";
import type { NationNameReads } from "../worldMap/reads.ts";
import type { GatherReads } from "../gather/reads.ts";
import type { ScopePlanetSource } from "../world/playablePlanets.ts";
import type { PlanetLibraryBase } from "@terra/shared";
import type {
  PlanetDraftRevisionInfo,
  PlanetDraftSaveInput,
  PlanetDraftSaved,
  PlanetDraftView,
  PlanetEditorDefinitions,
  PlanetLibraryPlanet,
  PlanetLibrarySaved,
  PlanetLibrarySummary,
  PlanetLibraryVersion,
  PlanetLibraryVersionInfo,
  SecondMapLabAnswer,
  SecondMapLabPreviewAnswer,
  SecondMapLabTarget,
  StarSystemRecord,
  StarSystemSaved,
  StarSystemSummary,
} from "../planetEditor/types.ts";

/** 로그인한 사용자 */
export interface Viewer {
  id: string;
  /** 입력한 모양의 로그인 아이디 */
  loginId: string;
  roles: Role[];
}

/** 관리자 화면의 사용자 한 줄(이메일 없음) */
export interface AdminUserRow {
  id: string;
  loginId: string;
  roles: Role[];
  banned: boolean;
  /** 만든 시각(ISO 8601, UTC) */
  createdAt: string;
}

export interface AdminUserList {
  users: AdminUserRow[];
  /** 검색 조건에 맞는 전체 수(쪽 나누기용) */
  total: number;
}

/** 관리자 기능 — 요청한 관리자의 세션 머리글로 Better Auth를 부른다(Better Auth도 권한을 한 번 더 본다) */
export interface AdminServices {
  listUsers(input: { search: string; limit: number; offset: number }): Promise<AdminUserList>;
  setRoles(input: { userId: string; roles: Role[] }): Promise<AdminUserRow>;
}

/** 화면 설정 중 바꿀 칸만. 없는 칸은 그대로 둔다 */
export type UserSettingsPatch = { [K in keyof UserSettings]?: UserSettings[K] | undefined };

/** 계정 화면 설정(user_settings) — 프로시저가 로그인한 본인 id로만 부른다 */
export interface SettingsServices {
  /** 저장한 설정. 아직 아무것도 저장하지 않았으면 null */
  get(userId: string): Promise<UserSettings | null>;
  /** 보낸 칸만 바꾼다(없으면 만든다). 저장한 뒤의 설정 */
  set(userId: string, patch: UserSettingsPatch): Promise<UserSettings>;
}

/** 행성 편집기 권한 동작(권한 문장 planetEditor, src/auth/permissions.ts) */
export type PlanetEditorAction = "read" | "write";

/** 속도 제한의 호출 종류: 정의 조회(감사 기록이 남는다)는 따로 한 번 더 센다 */
export type PlanetEditorCallKind = "definitions" | "drafts" | "library";

/**
 * 행성 보관함(팀 공용 목록, ADR 38 "바뀜: 행성 보관함"). 실패: BAD_REQUEST(data.reason = 정의 받지 않음 코드·invalid_name·
 * unknown_base), NOT_FOUND(planet_not_found·version_not_found), CONFLICT(revision_conflict, 지금 판은 다시 읽는다),
 * FORBIDDEN(not_author: 지우기는 만든 사람·admin만)
 */
export interface PlanetLibraryServices {
  list(viewer: Viewer): Promise<PlanetLibrarySummary[]>;
  get(viewer: Viewer, id: string): Promise<PlanetLibraryPlanet>;
  create(
    viewer: Viewer,
    input: { name: unknown; base: PlanetLibraryBase; definition: unknown },
  ): Promise<PlanetLibraryPlanet>;
  save(
    viewer: Viewer,
    input: { id: string; definition: unknown; expectedRevision: number },
  ): Promise<PlanetLibrarySaved>;
  rename(viewer: Viewer, input: { id: string; name: unknown }): Promise<{ name: string }>;
  remove(viewer: Viewer, id: string): Promise<{ removed: true }>;
  versions(viewer: Viewer, id: string): Promise<PlanetLibraryVersionInfo[]>;
  version(viewer: Viewer, input: { id: string; revision: number }): Promise<PlanetLibraryVersion>;
}

/**
 * 항성계 보관함(개발자 항성계 편집기, ADR 2026-10-31-star-system-editor). 행성 보관함과 같은 규칙. 실패: BAD_REQUEST
 * (data.reason invalid_name·invalid_definition), NOT_FOUND(system_not_found), CONFLICT(revision_conflict), FORBIDDEN(not_author)
 */
export interface StarSystemServices {
  list(viewer: Viewer): Promise<StarSystemSummary[]>;
  get(viewer: Viewer, id: string): Promise<StarSystemRecord>;
  create(viewer: Viewer, input: { name: unknown; definition: unknown }): Promise<StarSystemRecord>;
  save(
    viewer: Viewer,
    input: { id: string; definition: unknown; expectedRevision: number },
  ): Promise<StarSystemSaved>;
  rename(viewer: Viewer, input: { id: string; name: unknown }): Promise<{ name: string }>;
  remove(viewer: Viewer, id: string): Promise<{ removed: true }>;
}

/**
 * 행성 편집기(ADR 2026-10-29-planet-editor-stage1 9·11절) — 프로시저가 권한 미들웨어(우리 권한 표)를 거친 뒤 부른다.
 * 실패는 tRPC 오류로 던진다: BAD_REQUEST(data.reason = 받지 않음 코드), CONFLICT(기대 판), NOT_FOUND(되돌릴 판·초안 없음),
 * TOO_MANY_REQUESTS(속도 제한)
 */
export interface PlanetEditorServices {
  /**
   * 두 번째 권한 확인: Better Auth userHasPermission(요청한 사람의 세션, 세션을 늘리지 않는다). 아니면 FORBIDDEN·UNAUTHORIZED.
   * 한 요청 안에서는 동작마다 한 번만 묻는다
   */
  ensurePermission(action: PlanetEditorAction): Promise<void>;
  /** 사용자별 속도 제한. 넘으면 TOO_MANY_REQUESTS(data.reason "rate_limited") */
  admit(viewer: Viewer, kind: PlanetEditorCallKind): void;
  /** 정의 조회. 감사 기록을 쓴 뒤에만 돌려준다(못 쓰면 실패) */
  definitions(viewer: Viewer): Promise<PlanetEditorDefinitions>;
  getDraft(viewer: Viewer, planetId: string): Promise<PlanetDraftView | null>;
  revisions(viewer: Viewer, planetId: string): Promise<PlanetDraftRevisionInfo[]>;
  save(viewer: Viewer, input: PlanetDraftSaveInput): Promise<PlanetDraftSaved>;
  restore(viewer: Viewer, input: { planetId: string; revision: number }): Promise<PlanetDraftView>;
  remove(viewer: Viewer, planetId: string): Promise<{ removed: boolean }>;
  library: PlanetLibraryServices;
  systems: StarSystemServices;
}

/** 설정 칸 패널 동작(권한 문장 tuning) */
export type TuningAction = "read" | "write";

/** 묶음 적용 입력(docs/adr/2026-11-01-dev-settings-panel.md 8절) */
export interface TuningApplyInput {
  /** 이 기기가 본 세계 설정 판(list.revision). 지금 판과 다르면 CONFLICT */
  readonly expectedRevision: number;
  /** 칸마다 새 값(null·팩 값 = 되돌리기). 한 묶음으로 검사·저장·반영한다 */
  readonly changes: readonly { readonly id: string; readonly value: number | null }[];
  /** 계산식마다 새 식(null·팩 식 = 되돌리기, docs/adr/2026-11-01-formula-editor.md). 칸과 같은 묶음으로 검사·저장한다 */
  readonly formulas?: readonly { readonly id: string; readonly source: string | null }[] | undefined;
  readonly note?: string | null | undefined;
  /** 구조 값(D-5054)이 들면 확인 창을 거쳤다 */
  readonly confirmStructural?: boolean | undefined;
}

/**
 * 개발자 설정 칸 패널(docs/adr/2026-11-01-dev-settings-panel.md 8절, src/tuning/services.ts). 쓰기는 바뀐 목록을 돌려준다.
 * 오류는 data.reason(@terra/shared TUNING_REASONS), 규칙 문제는 data.details
 */
export interface TuningServices {
  /** 두 번째 권한 확인(Better Auth). 한 요청 안에서는 동작마다 한 번만 묻는다 */
  ensurePermission(action: TuningAction): Promise<void>;
  /** 사용자별 속도 제한(조회·쓰기 따로). 넘으면 TOO_MANY_REQUESTS */
  admit(viewer: Viewer, action: TuningAction): void;
  list(viewer: Viewer): Promise<TuningListResponse>;
  history(viewer: Viewer): Promise<TuningHistoryResponse>;
  exportDiff(viewer: Viewer): Promise<TuningExportResponse>;
  /** 묶음 적용(tRPC tuning.save) */
  save(viewer: Viewer, input: TuningApplyInput): Promise<TuningListResponse>;
  revertAll(viewer: Viewer, input: { expectedRevision: number }): Promise<TuningListResponse>;
}

/**
 * 밸런스 화면(docs/adr/2026-11-01-balance-screen.md 3절, src/balance/services.ts). 권한·조회 속도 제한은 D1(tuning:read)이 먼저 본다.
 * 오류는 data.reason(@terra/shared BALANCE_REASONS)
 */
/** 계산식 탭(docs/adr/2026-11-01-formula-editor.md, src/formulas/services.ts). 권한·조회 속도 제한은 D1(tuning:read)이 먼저 본다 */
export interface FormulaServices {
  list(): Promise<FormulaListResponse>;
}

export interface BalanceServices {
  table(): Promise<BalanceTableResponse>;
  /** 시드 대결(워커). 사용자 속도 제한·서버 전체 한 번에 하나 */
  duels(viewer: Viewer, input: BalanceDuelsInput): Promise<BalanceDuelsResponse>;
}

/**
 * 개발자 전투 다시보기(docs/adr/2026-11-01-battle-replay.md 5절, src/battleReplay/services.ts). 권한·조회 속도 제한은
 * D1(tuning:read)이 먼저 본다. 오류는 data.reason(@terra/shared BATTLE_REPLAY_REASONS)
 */
export interface BattleReplayServices {
  /** 시범 6 대 6 기록(워커). 사용자 속도 제한·서버 전체 한 번에 하나 */
  demo(viewer: Viewer, input: { seed: number }): Promise<BattleReplayDemoResponse>;
}

/** 홈 자료 조회의 조건. preview는 프로시저가 권한(home: preview, dev·admin)을 본 뒤에만 true다 */
export interface HomeQuery {
  readonly preview: boolean;
  /** 서버 시각(UTC ms, ctx.now()) */
  readonly now: number;
}

/**
 * 홈 자료 — 처리할 일(inbox.list)·복귀 요약(summary.get)·서버 카드(dashboard.cards). ADR 2026-10-29-app-shell 6·7·8절.
 * 프로시저가 로그인한 본인으로만 부른다. 요청 때 계정 상태에서 만든다(서버가 늘 들고 있지 않는다).
 */
export interface HomeServices {
  inbox(viewer: Viewer, query: HomeQuery): Promise<InboxListResponse>;
  summary(viewer: Viewer, query: HomeQuery): Promise<SummaryGetResponse>;
  /** 복귀 요약 확인: until(그 요약의 끝)까지 본 것으로 적는다 */
  ackSummary(viewer: Viewer, until: number, now: number): Promise<void>;
  /** ids: 홈에 있는 카드 ID(모르는 ID·기기 카드는 빼고 답한다) */
  cards(viewer: Viewer, ids: readonly string[], query: HomeQuery): Promise<DashboardCardsResponse>;
}

/**
 * 유닛·사이보그 화면 자료(units.list·cyborg.get, ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)").
 * 프로시저가 로그인한 본인으로만 부른다. preview는 홈 시안 자료와 같은 권한(home: preview)을 본 뒤에만 true다.
 */
export interface RosterServices {
  units(viewer: Viewer, query: HomeQuery): Promise<UnitsListResponse>;
  cyborg(viewer: Viewer, query: HomeQuery): Promise<CyborgGetResponse>;
  /** 유닛 추천 표(1차 생산 스탯 짝·전투 클래스, docs/adr/2026-11-11-production-six.md) */
  guide(now: number): UnitGuideResponse;
}

/**
 * 사이보그 만들기 조회(cyborg.status·creation·nameCheck, docs/adr/2026-11-01-first-login-cyborg.md 4절). 굴리기·만들기는
 * WebSocket이다. 프로시저가 로그인한 본인으로만 부른다
 */
export interface CyborgReadServices {
  status(viewer: Viewer): CyborgStatusResponse;
  /** 만들기 화면 자료(운영진이면 다시 굴리기 제한 없음, 올린 국가 마크는 DB에서 읽어 기다린다) */
  creation(viewer: Viewer, now: number): CyborgCreationResponse | Promise<CyborgCreationResponse>;
  nameCheck(name: string): CyborgNameCheckResponse;
}

/**
 * 사이보그 유닛 융합·유전자 조회(fusion.overview, D-470·D-478·D-516). 바꾸는 명령은 WebSocket cyborg_fuse·dev_grant_goods·gene_*다.
 * devGrant = dev·admin(개발 시험 물자 받기 버튼)
 */
export interface FusionReadServices {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): Promise<FusionOverviewResponse>;
}

/** 부상·병원 조회(hospital.overview, docs/adr/2026-11-08-injury.md). 바꾸는 명령은 WebSocket hospital_treat·dev_injure_unit이다 */
export interface HospitalReadServices {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): Promise<HospitalOverviewResponse>;
}

/**
 * 신전 조회(temple.overview, docs/adr/2026-11-07-temple-religion.md). 바꾸는 명령은 WebSocket temple_*·dev_ghost_unit이다.
 * devGrant = dev·admin(개발 시험 비활성 만들기)
 */
export interface TempleReadServices {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): Promise<TempleOverviewResponse>;
}

/**
 * 폐허 복원 조회(ruins.overview, docs/adr/2026-11-07-ruins-restoration.md). 바꾸는 명령은 WebSocket facility_build(행정 건물)·
 * restoration_open·restoration_fund·dev_make_ruin이다. devGrant = dev·admin(개발 시험 폐허 만들기). NPC 사회 런타임이 없으면 undefined
 */
export interface RuinReadServices {
  overview(
    viewer: { readonly id: string; readonly devGrant: boolean },
    nowMs: number,
  ): RuinsOverviewResponse | undefined;
}

/**
 * 구인 카드 조회(recruit.board, D-469). 고용은 WebSocket recruit_hire다. owner = dev·admin(그 도시 주인 NPC 세력의 카드도 본다)
 */
export interface RecruitReadServices {
  board(
    viewer: { readonly id: string; readonly owner: boolean },
    cityId: number | undefined,
    nowMs: number,
  ): RecruitBoardResponse | undefined;
}

/**
 * 개발자 2차맵 시험(planetEditor.secondMap, ADR 46 "구현하며 정한 것 (개발자 2차맵 시험)"): 월드 행성의 2차맵 지형 주소·행성 칸 값.
 * 실패: SecondMapLabInputError(틀린 키) → BAD_REQUEST, SecondMapLabNotReadyError(지형 서비스 준비 전) → PRECONDITION_FAILED
 */
export interface SecondMapLabServices {
  locate(planetId: string, target: SecondMapLabTarget): Promise<SecondMapLabAnswer>;
  preview(
    planetId: string,
    target: SecondMapLabTarget,
    mapProps: readonly unknown[],
  ): Promise<SecondMapLabPreviewAnswer>;
}

/** 경제 화면 조회의 조건. preview는 프로시저가 권한(home: preview, dev·admin)을 본 뒤에만 true다 */
export interface EconomyQuery {
  readonly preview: boolean;
  /** 서버 시각(UTC ms, ctx.now()) */
  readonly now: number;
}

/**
 * 경제 화면 자료(조회만) — ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)". 프로시저가 로그인한 본인으로만 부른다.
 * 거래소·생산·환전은 서버가 아직 돌리지 않아 시안 자료가 아니면 status "not_ready"다(src/economyView/services.ts).
 * 실패: NOT_FOUND(data.reason unknown_item·unknown_city)
 */
export interface EconomyServices {
  catalog(): EconomyCatalogResponse;
  /** 도시 이름(이름 있는 도시 가운데 그 사용자가 아는 도시만, 도시 ID 차례 — 기획 답 621 나) */
  cityNames(viewer: Viewer): Promise<EconomyCityNamesResponse>;
  holdings(viewer: Viewer, query: EconomyQuery): Promise<EconomyHoldingsResponse>;
  production(viewer: Viewer, query: EconomyQuery): EconomyProductionResponse;
  marketItems(viewer: Viewer, query: EconomyQuery): MarketItemsResponse;
  marketCities(viewer: Viewer, item: string, query: EconomyQuery): MarketCitiesResponse;
  marketBook(viewer: Viewer, item: string, city: string, query: EconomyQuery): MarketBookResponse;
  orders(viewer: Viewer, query: EconomyQuery): EconomyOrdersResponse;
  exchange(viewer: Viewer, query: EconomyQuery): EconomyExchangeResponse;
}

/**
 * 세력 화면(faction.overview, D-439) — 내 몫·소속 세력은 실제 자료, 도시·외교·전쟁·정권·지분·점령은 규칙(R4b) 전이라
 * 준비 중이고 dev·admin의 시안 자료(preview)로만 채운다. 프로시저가 로그인한 본인으로만 부른다(src/factionScreen/overview.ts)
 */
export interface FactionScreenServices {
  overview(viewer: Viewer, query: HomeQuery): Promise<FactionOverviewResponse>;
}

/** 우편(mail.list, D-270) — 조회만. 보내기·받기는 WebSocket 명령으로 만든다(src/mail/list.ts) */
export interface MailServices {
  list(viewer: Viewer, query: HomeQuery): Promise<MailListResponse>;
}

/** 지도 흐름 조회(world.cities·world.myPosition, src/worldMap/reads.ts). 로그인한 본인으로만 부른다 */
export interface WorldMapReads {
  cities(viewer: Viewer, nowMs: number): Promise<WorldCitiesResponse>;
  position(viewer: Viewer, nowMs: number): WorldPositionResponse;
  /** 2차맵 사이 이동(docs/adr/2026-11-07-play-flow.md WP9, src/worldMap/travelReads.ts). 없으면 not_ready */
  travels?: TravelReads["travels"];
  travelPlan?: TravelReads["travelPlan"];
  /** 2차맵 화면의 내 유닛 목록(docs/adr/2026-11-07-unit-control.md, src/worldMap/mapUnits.ts). 없으면 not_ready */
  mapUnits?: MapUnitReads["mapUnits"];
  /** 누른 남의 유닛의 세력·종류(기획 답 636 나, 같은 모듈). 없으면 not_ready */
  unitGlance?: MapUnitReads["unitGlance"];
  /** 2차맵 유닛의 3D 외형(docs/adr/2026-11-11-character-3d.md 5절, 같은 모듈). 없으면 not_ready */
  unitLooks?: MapUnitReads["unitLooks"];
  /** 정부(행정 건물) 판(docs/adr/2026-11-07-play-flow.md "WP-NPC", src/government/reads.ts). 없으면 not_ready */
  government?: GovernmentReads["government"];
  /** 지도자 창구(742 나 "WP-NPC3", 같은 모듈 — 누른 지도자의 나라 수도 정부 판). 없으면 not_ready */
  governmentOfLeader?: GovernmentReads["governmentOfLeader"];
  /** 국적 바꾸기 조건(docs/adr/2026-11-08-citizenship.md, src/citizenship/service.ts). 없으면 not_ready */
  naturalization?: NaturalizationReads["naturalization"];
  /** 세력 코드 → 나라·지도자 이름(세력 화면, 같은 절) */
  nationNames?: NationNameReads["nationNames"];
}

/** 세계 배치 서비스와 그 행성(세계 행성) */
export interface WorldLayoutSource {
  readonly planetId: string;
  readonly service: PlacementService;
}

/** 영토 조회(src/territory/service.ts). 없는 행성이면 undefined */
export interface TerritoryReadServices {
  planetView(planetId: string, userId: string | null): Promise<TerritoryPlanetView | undefined>;
  mineView(planetId: string, userId: string): Promise<TerritoryPlanetView | undefined>;
}

export interface TrpcContext {
  /** 콘텐츠 팩 버전 */
  contentVersion: string;
  /** 서버 시각(UTC ms). 시험에서는 고정값을 넣는다 */
  now: () => number;
  /** 로그인한 사용자. 처음 부를 때 한 번만 조회한다. 로그인하지 않았거나 인증이 꺼져 있으면 null */
  viewer: () => Promise<Viewer | null>;
  /** 관리자 기능. 인증이 꺼져 있으면(DB 없음) 없다. 권한 검사는 프로시저 미들웨어가 먼저 한다 */
  admin: AdminServices | undefined;
  /** 계정 화면 설정. 인증이 꺼져 있으면(DB 없음) 없다 */
  settings: SettingsServices | undefined;
  /** 운영자 콘솔(docs/adr/2026-11-08-operator-console.md). 인증(DB)이 꺼져 있으면 없다. 권한은 ops 라우터가 본다 */
  ops?: OpsServices | undefined;
  /** 플레이어 세력 정체성(docs/adr/2026-11-11-faction-identity.md). 인증(DB)이 꺼져 있으면 없다 */
  factionIdentity?: FactionIdentityServices | undefined;
  /** 행성 편집기. 인증이 꺼져 있거나 정의 조회 자료를 받지 않았으면 없다 */
  planetEditor: PlanetEditorServices | undefined;
  /** 홈 자료. 늘 있다(지금 제공 함수가 0개라 DB가 필요 없다). 로그인 검사는 프로시저가 먼저 한다 */
  home: HomeServices;
  /** 유닛·사이보그 화면 자료. 늘 있다(세계·DB가 없으면 실제 자료는 빈 목록) */
  roster: RosterServices;
  /** 사이보그 만들기 조회. 세계(DB)가 없거나 부팅 복구 전이면 undefined(프로시저가 PRECONDITION_FAILED) */
  cyborgs?: (() => CyborgReadServices | undefined) | undefined;
  /** 구인 카드 조회(D-469). 세계·NPC 사회 런타임이 없거나 부팅 복구 전이면 undefined(프로시저가 PRECONDITION_FAILED) */
  recruits?: (() => RecruitReadServices | undefined) | undefined;
  /** 융합·유전자 조회(D-470·D-478). 세계(DB)가 없거나 부팅 복구 전이면 undefined(프로시저가 PRECONDITION_FAILED) */
  fusion?: (() => FusionReadServices | undefined) | undefined;
  /** 신전 조회. 세계(DB)가 없거나 부팅 복구 전이면 undefined(프로시저가 PRECONDITION_FAILED) */
  temple?: (() => TempleReadServices | undefined) | undefined;
  /** 부상·병원 조회(D-521). 세계(DB)가 없거나 부팅 복구 전이면 undefined(프로시저가 PRECONDITION_FAILED) */
  hospital?: (() => HospitalReadServices | undefined) | undefined;
  /** 폐허 복원 조회. 세계·NPC 사회 런타임이 없거나 부팅 복구 전이면 undefined(프로시저가 PRECONDITION_FAILED) */
  ruins?: (() => RuinReadServices | undefined) | undefined;
  /** 개발자 2차맵 시험. 월드·지형 서비스·행성 서비스가 다 있을 때만 */
  secondMapLab?: SecondMapLabServices | undefined;
  /** 영토 조회(docs/adr/2026-11-03-territory-layer.md 5절). 세계(DB)가 없거나 부팅 복구 전이면 undefined */
  territory?: (() => TerritoryReadServices | undefined) | undefined;
  /**
   * 세계 배치 화면(기획 D-528, src/world/placementService.ts). 세계(DB)·행성 값이 없거나 부팅 복구 전이면 service()가 undefined.
   * ip = 요청 IP(감사 기록)
   */
  worldLayout?:
    | { readonly service: () => WorldLayoutSource | undefined; readonly ip: string | null }
    | undefined;
  /** 범위 줄의 행성 목록 재료(콘텐츠 팩 행성 원본, docs/adr/2026-11-11-planet-scope.md). 없으면 플레이 행성 ID만 보인다 */
  planetScope?: (() => readonly ScopePlanetSource[]) | undefined;
  /** 지도 흐름 조회(docs/adr/2026-11-07-play-flow.md "WP2"). 세계(DB)가 없거나 부팅 복구 전이면 undefined(not_ready로 답한다) */
  worldMap?: (() => WorldMapReads | undefined) | undefined;
  /** 원자재 오브젝트 채집·건물 들어가기 조회(docs/adr/2026-11-07-gather-objects.md). 세계(DB)가 없으면 undefined(not_ready로 답한다) */
  gather?: (() => GatherReads | undefined) | undefined;
  /** 경제 화면 자료. 늘 있다(팩이 없으면 빈 목록, 월드가 없으면 잔고 없음) */
  economy: EconomyServices;
  /** 세력 화면. 늘 있다(DB·월드가 없으면 실제 자료가 빈 값이다) */
  faction: FactionScreenServices;
  /** 우편. 늘 있다(우편 표가 아직 없어 실제 우편함은 비어 있다) */
  mail: MailServices;
  /** 보유 물건 조회. 늘 있다(월드가 없거나 준비 전이면 빈 목록, docs/adr/2026-11-03-item-holdings.md) */
  holdings: HoldingsReadServices;
  /** 생명 수치 조회(D-512). 늘 있다(월드가 없거나 준비 전이면 빈 목록) */
  vitals: VitalsReadServices;
  /** 랭킹 조회(docs/adr/2026-11-07-ranking.md). 맥락 팩토리는 늘 넣는다(DB가 없으면 빈 판). 없으면(시험 맥락) 빈 판 */
  ranking?: RankingServices | undefined;
  /** 노동 계약 조회(src/labor/views.ts). 맥락 팩토리는 늘 넣는다(세계·DB가 없으면 status "not_ready"). 없으면(시험 맥락) not_ready */
  labor?: LaborScreenServices | undefined;
  /** 건물 조회(src/facilities/screen.ts). 맥락 팩토리는 늘 넣는다(세계·DB가 없으면 status "not_ready"). 없으면(시험 맥락) not_ready */
  facilities?: FacilityScreenServices | undefined;
  /** 설정 칸 패널. 인증(DB)과 팩 설정 칸 접근자가 있을 때만 */
  tuning?: TuningServices | undefined;
  /** 밸런스 화면. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다) */
  balance?: BalanceServices | undefined;
  /** 스킬 편집기·행동별 소모 화면. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다) */
  skills?: SkillEditorServices | undefined;
  /** 아이템 편집기. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다, docs/adr/2026-11-01-item-editor.md) */
  items?: ItemEditorServices | undefined;
  /** 건물 편집기. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다, docs/adr/2026-11-02-building-editor.md) */
  buildings?: BuildingEditorServices | undefined;
  /** 크리처 편집기. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다) */
  creatures?: CreatureEditorServices | undefined;
  /** 시작 국가 설정 편집기. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다, docs/adr/2026-11-10-nation-editor.md) */
  nations?: NationEditorServices | undefined;
  /** 전투 실험실(앱에 하나인 서비스 + 이 요청의 DB·접속 주소). 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다) */
  battleLab?: { readonly shared: BattleLabShared; readonly db: Database; readonly ip: string } | undefined;
  /** 전투 다시보기. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다) */
  battleReplay?: BattleReplayServices | undefined;
  /** 계산식 탭. 설정 칸 패널과 같이 있을 때만(권한은 tuning이 본다) */
  formulas?: FormulaServices | undefined;
}

export interface TrpcContextOptions {
  contentVersion: string;
  now: () => number;
}
