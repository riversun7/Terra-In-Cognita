// tRPC 맥락 만들기 — Fastify 요청에서 세션을 (필요할 때만) 읽는다.
// 맥락 타입(context.ts)과 나눈 이유: 이 파일은 Fastify·Better Auth 타입을 쓴다. 게임 앱이 읽는 선언 파일에 넣지 않는다.
// 출처 확인(src/auth/requestGuard.ts, ADR 38 9절): 다른 사이트가 사용자 쿠키로 관리자·편집기 기능을 부르지 못하게.
// - 쓰기(GET·HEAD가 아닌 요청)는 같은 출처에서 온 것만 받는다(계정 경로와 같은 규칙 isSameOriginRequest).
// - 조회(GET)도 다른 사이트에서 온 것(Sec-Fetch-Site cross-site·same-site, 다른 Origin)은 받지 않는다(isAllowedReadRequest):
//   응답은 다른 사이트가 읽을 수 없지만, 다른 사이트의 링크 하나로 감사 기록(정의 조회)이 쌓이지 않게.
// 맥락을 만들 때 던지면 묶음 요청의 프로시저마다 같은 오류가 간다(FORBIDDEN, data.reason "cross_origin").
// 프로시저는 하나도 돌지 않는다.
import type { FastifyReply, FastifyRequest } from "fastify";
import { createAdminServices } from "../auth/adminServices.ts";
import { type OpsShared, createOpsServices } from "../ops/services.ts";
import type { TerraAuth } from "../auth/auth.ts";
import { authHeaders } from "../auth/http.ts";
import { parseRoleString } from "../auth/permissions.ts";
import { isAllowedReadRequest, isSameOriginRequest } from "../auth/requestGuard.ts";
import type { BattleLabShared } from "../battleLab/services.ts";
import type { Database } from "../db/client.ts";
import { emptyEconomyCatalog } from "../economyView/catalog.ts";
import { createEconomyServices } from "../economyView/services.ts";
import type { LaborService } from "../labor/service.ts";
import { createLaborScreenServices } from "../labor/views.ts";
import { type FacilityScreenSource, createFacilityScreenServices } from "../facilities/screen.ts";
import { createHomeServices } from "../home/services.ts";
import { createRosterServices } from "../roster/services.ts";
import { createFactionScreenServices } from "../factionScreen/overview.ts";
import type { FactionScreenRules } from "../factionScreen/tuning.ts";
import type { FactionSource } from "../factionScreen/source.ts";
import { createMailServices } from "../mail/list.ts";
import { type HoldingsReadServices, NO_HOLDINGS } from "../holdings/reads.ts";
import { NO_VITALS, type VitalsReadServices } from "../vitals/reads.ts";
import { type RankingServices, createRankingServices } from "../ranking/services.ts";
import {
  type PlanetEditorShared,
  betterAuthPermissionCheck,
  createPlanetEditorServices,
} from "../planetEditor/services.ts";
import { createSettingsServices } from "../settings/store.ts";
import { type TuningShared, betterAuthTuningCheck, createTuningServices } from "../tuning/services.ts";
import { createBuildingEditorServices } from "../buildingEdit/services.ts";
import { createCreatureEditorServices } from "../creatureEdit/services.ts";
import { type ContentEditShared, createSkillEditorServices } from "../contentEdit/services.ts";
import { type ItemEditShared, createItemEditorServices } from "../itemEdit/services.ts";
import type { SummaryBackend } from "../summary/summary.ts";
import type { TravelService } from "../travel/service.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type {
  BalanceServices,
  BattleReplayServices,
  FormulaServices,
  EconomyServices,
  SecondMapLabServices,
  TerritoryReadServices,
  WorldLayoutSource,
  TrpcContext,
  TrpcContextOptions,
  CyborgReadServices,
  RecruitReadServices,
  FusionReadServices,
  TempleReadServices,
  HospitalReadServices,
  RuinReadServices,
  Viewer,
  WorldMapReads,
} from "./context.ts";
import type { GatherReads } from "../gather/reads.ts";
import { reasonedError } from "./init.ts";

export interface ContextFactoryOptions extends TrpcContextOptions {
  /** 인증이 켜져 있을 때(DB 있음)만 */
  auth?: { auth: TerraAuth; db: Database } | undefined;
  /**
   * 앱 출처(BETTER_AUTH_URL). 있으면 요청의 출처를 본다. 없으면(인증이 꺼진 서버) 보지 않는다: 세션이 없어
   * 로그인이 필요한 프로시저는 모두 UNAUTHORIZED다
   */
  appOrigin?: string | undefined;
  /** 행성 편집기(서버가 켤 때 만든 정의 조회 자료·속도 제한기, createPlanetEditorShared). 인증이 켜져 있어야 쓴다 */
  planetEditor?: PlanetEditorShared | undefined;
  /** 복귀 요약 자료(DB·월드가 있을 때) */
  summary?: SummaryBackend | undefined;
  /** 처리할 일 제공 함수가 읽는 DB(정원사 웨이브 예고, DB가 있을 때) */
  inboxPool?: QueryPool | undefined;
  /** 처리할 일 정찰 끝(scout_returned)이 읽는 이동 서비스(세계가 준비된 뒤, 기획 답 612 나) */
  inboxTravel?: (() => Pick<TravelService, "list"> | undefined) | undefined;
  /** 유닛·사이보그 화면: 콘텐츠 팩 자료(없으면 시험 자료)와 실제 유닛 출처(DB·월드가 있을 때) */
  roster?: Parameters<typeof createRosterServices>[0] | undefined;
  /** 개발자 2차맵 시험(월드·지형 서비스·행성 서비스가 다 있을 때, src/world/secondMapLab.ts) */
  secondMapLab?: SecondMapLabServices | undefined;
  /** 영토 조회(세계가 준비되면 서비스, docs/adr/2026-11-03-territory-layer.md 5절). 없으면 늘 준비 전 */
  territory?: (() => TerritoryReadServices | undefined) | undefined;
  /** 세계 배치 화면(기획 D-528, 세계가 준비되면 서비스). 없으면 늘 준비 전 */
  worldLayout?: (() => WorldLayoutSource | undefined) | undefined;
  /** 지도 흐름 조회(세계가 준비되면 서비스, src/worldMap/reads.ts). 없으면 늘 준비 전 */
  worldMap?: (() => WorldMapReads | undefined) | undefined;
  /** 원자재 오브젝트 채집 조회(세계가 준비되면, src/gather/reads.ts). 없으면 늘 준비 전 */
  gather?: (() => GatherReads | undefined) | undefined;
  /** 경제 화면 자료(팩 목록·월드 원장). 없으면 빈 목록·잔고 없음 */
  economy?: EconomyServices | undefined;
  /** 세력 화면 실제 자료(DB·월드가 있을 때) */
  factionSource?: FactionSource | undefined;
  /** 노동 계약 서비스(세계가 준비되고 DB가 있을 때). 없으면 labor.overview는 not_ready */
  labor?: (() => LaborService | undefined) | undefined;
  /** 건물 화면 자료(세계가 준비되고 DB가 있을 때). 없으면 facilities.overview는 not_ready */
  facilities?: (() => FacilityScreenSource | undefined) | undefined;
  /** 세력 화면 규칙 설정값(설정 칸 실효 값: 공물·민심 문턱·주기, 부를 때마다 읽는다). 없으면 sim 시험 계수표 */
  factionRules?: (() => FactionScreenRules) | undefined;
  /** 설정 칸 패널(접근자·속도 제한기·쓰기 차례, src/tuning/services.ts). 인증이 켜져 있어야 쓴다 */
  tuning?: TuningShared | undefined;
  /** 밸런스 화면(src/balance/services.ts, 앱에 하나). 설정 칸 패널이 있을 때만 맥락에 넣는다(권한은 tuning이 본다) */
  balance?: BalanceServices | undefined;
  /** 스킬 편집기(src/contentEdit/services.ts 접근자·쓰기 차례). 설정 칸 패널이 있을 때만 맥락에 넣는다(권한은 tuning이 본다) */
  contentEdit?: ContentEditShared | undefined;
  /** 아이템 편집기(같은 덮어쓰기 층 + 팩 레시피·코드 참조 표, src/itemEdit/services.ts). 설정 칸 패널이 있을 때만 */
  itemEdit?: ItemEditShared | undefined;
  /** 전투 실험실(src/battleLab/services.ts, 앱에 하나). 설정 칸 패널이 있을 때만 맥락에 넣는다(권한은 tuning이 본다) */
  battleLab?: BattleLabShared | undefined;
  /** 전투 다시보기(src/battleReplay/services.ts, 앱에 하나). 설정 칸 패널이 있을 때만 맥락에 넣는다(권한은 tuning이 본다) */
  battleReplay?: BattleReplayServices | undefined;
  /** 계산식 탭(src/formulas/services.ts, 앱에 하나). 설정 칸 패널이 있을 때만 맥락에 넣는다 */
  formulas?: FormulaServices | undefined;
  /** 사이보그 만들기 조회(세계가 준비되면 서비스, docs/adr/2026-11-01-first-login-cyborg.md 4절). 없으면 늘 준비 전 */
  cyborgs?: (() => CyborgReadServices | undefined) | undefined;
  /** 구인 카드 조회(세계·NPC 사회 런타임이 준비되면 서비스, D-469). 없으면 늘 준비 전 */
  recruits?: (() => RecruitReadServices | undefined) | undefined;
  /** 융합·유전자 조회(세계가 준비되면 서비스, D-470·D-478). 없으면 늘 준비 전 */
  fusion?: (() => FusionReadServices | undefined) | undefined;
  /** 신전 조회(세계가 준비되면 서비스). 없으면 늘 준비 전 */
  temple?: (() => TempleReadServices | undefined) | undefined;
  /** 부상·병원 조회(세계가 준비되면 서비스, D-521). 없으면 늘 준비 전 */
  hospital?: (() => HospitalReadServices | undefined) | undefined;
  /** 폐허 복원 조회(세계·NPC 사회 런타임이 준비되면 서비스). 없으면 늘 준비 전 */
  ruins?: (() => RuinReadServices | undefined) | undefined;
  /** 보유 물건 조회(월드가 있을 때, docs/adr/2026-11-03-item-holdings.md). 없으면 늘 빈 목록 */
  holdings?: HoldingsReadServices | undefined;
  /** 생명 수치 조회(월드가 있을 때, D-512). 없으면 늘 빈 목록 */
  vitals?: VitalsReadServices | undefined;
  /** 랭킹 조회(docs/adr/2026-11-07-ranking.md). 없으면 빈 판(경로 목록 없음) */
  ranking?: RankingServices | undefined;
  /** 운영자 콘솔(앱에 하나, src/ops/services.ts). 인증이 켜져 있어야 쓴다 */
  ops?: OpsShared | undefined;
}

/** 읽기 요청(출처 규칙이 쓰기보다 느슨하다: 주소창에서 연 것도 받는다). tRPC 조회는 GET, 쓰기는 POST다 */
const READ_METHODS = new Set(["GET", "HEAD"]);

/** 사이보그 조회가 없는 서버(세계·DB 없음) */
const noCyborgs = (): CyborgReadServices | undefined => undefined;

/** 이 요청을 받아도 되는 출처인지(읽기·쓰기 규칙이 다르다) */
function isAllowedOrigin(request: FastifyRequest, appOrigin: string): boolean {
  return READ_METHODS.has(request.method)
    ? isAllowedReadRequest(request.headers, appOrigin)
    : isSameOriginRequest(request.headers, appOrigin);
}

/**
 * 세션 조회. 이 조회는 새 쿠키를 응답에 싣지 않으므로 세션 연장(refresh)은 끈다(늘리면 DB 만료만 늘고 쿠키는 그대로 끝난다).
 * 연장은 기기가 GET /api/auth/get-session을 부를 때 한다(쿠키 만료도 함께 늘어난다).
 * 정지된 계정은 로그인하지 않은 것으로 본다(기본 거부).
 */
export async function loadViewer(auth: TerraAuth, headers: Headers): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers, query: { disableRefresh: true } });
  if (!session || session.user.banned) return null;
  return { id: session.user.id, loginId: session.user.name, roles: parseRoleString(session.user.role) };
}

/** 요청마다 맥락을 만드는 함수. req가 없으면(서버 안 호출·시험) 로그인하지 않은 맥락 */
export function createContextFactory(options: ContextFactoryOptions) {
  // 홈 자료(처리할 일·복귀 요약·서버 카드)는 요청마다 만들지 않고 앱에 하나다(제공 함수 목록을 한 번 만든다)
  const home = createHomeServices({
    summary: options.summary,
    pool: options.inboxPool,
    travel: options.inboxTravel,
  });
  const roster = createRosterServices(options.roster);
  // 경제 화면 자료도 앱에 하나다(시안 시장 캐시를 함께 쓴다)
  const economy =
    options.economy ?? createEconomyServices({ catalog: emptyEconomyCatalog(options.contentVersion) });
  // 세력 화면·우편 조회도 앱에 하나다
  const faction = createFactionScreenServices({ source: options.factionSource, rules: options.factionRules });
  const mail = createMailServices();
  const labor = createLaborScreenServices(options.labor);
  const facilities = createFacilityScreenServices(options.facilities);
  const ranking = options.ranking ?? createRankingServices({ paths: [] });
  return (opts?: { req: FastifyRequest; res?: FastifyReply }): TrpcContext => {
    const authDeps = options.auth;
    const request = opts?.req;
    if (request && options.appOrigin !== undefined && !isAllowedOrigin(request, options.appOrigin)) {
      throw reasonedError("FORBIDDEN", "CROSS_ORIGIN_REQUEST", "cross_origin");
    }
    let viewerPromise: Promise<Viewer | null> | undefined;
    const viewer = (): Promise<Viewer | null> => {
      viewerPromise ??=
        authDeps && request ? loadViewer(authDeps.auth, authHeaders(request)) : Promise.resolve(null);
      return viewerPromise;
    };
    const editor = options.planetEditor;
    const tuning = options.tuning;
    return {
      contentVersion: options.contentVersion,
      now: options.now,
      viewer,
      admin:
        authDeps && request
          ? createAdminServices({ ...authDeps, request, reply: opts?.res, viewer })
          : undefined,
      settings: authDeps ? createSettingsServices(authDeps.db) : undefined,
      ops:
        authDeps && request && options.ops ? createOpsServices(options.ops, { ip: request.ip }) : undefined,
      planetEditor:
        authDeps && request && editor
          ? createPlanetEditorServices({
              db: authDeps.db,
              shared: editor,
              ip: request.ip,
              hasPermission: betterAuthPermissionCheck(authDeps.auth, request),
            })
          : undefined,
      home,
      roster,
      cyborgs: options.cyborgs ?? noCyborgs,
      recruits: options.recruits,
      fusion: options.fusion,
      temple: options.temple,
      hospital: options.hospital,
      ruins: options.ruins,
      secondMapLab: options.secondMapLab,
      territory: options.territory,
      worldLayout:
        options.worldLayout && request ? { service: options.worldLayout, ip: request.ip } : undefined,
      worldMap: options.worldMap,
      gather: options.gather,
      economy,
      faction,
      mail,
      holdings: options.holdings ?? NO_HOLDINGS,
      vitals: options.vitals ?? NO_VITALS,
      ranking,
      labor,
      facilities,
      tuning:
        authDeps && request && tuning
          ? createTuningServices({
              db: authDeps.db,
              shared: tuning,
              ip: request.ip,
              hasPermission: betterAuthTuningCheck(authDeps.auth, request),
              content: options.contentEdit,
            })
          : undefined,
      balance: authDeps && request && tuning ? options.balance : undefined,
      skills:
        authDeps && request && tuning && options.contentEdit
          ? createSkillEditorServices({ db: authDeps.db, shared: options.contentEdit, ip: request.ip })
          : undefined,
      items:
        authDeps && request && tuning && options.itemEdit
          ? createItemEditorServices({ db: authDeps.db, shared: options.itemEdit, ip: request.ip })
          : undefined,
      buildings:
        authDeps && request && tuning && options.contentEdit
          ? createBuildingEditorServices({
              db: authDeps.db,
              shared: options.contentEdit,
              tuning,
              ip: request.ip,
            })
          : undefined,
      creatures:
        authDeps && request && tuning && options.contentEdit
          ? createCreatureEditorServices({
              db: authDeps.db,
              shared: options.contentEdit,
              ip: request.ip,
            })
          : undefined,
      battleLab:
        authDeps && request && tuning && options.battleLab
          ? { shared: options.battleLab, db: authDeps.db, ip: request.ip }
          : undefined,
      battleReplay: authDeps && request && tuning ? options.battleReplay : undefined,
      formulas: authDeps && request && tuning ? options.formulas : undefined,
    };
  };
}
