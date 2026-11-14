// buildApp(app.ts)의 설정 타입. app.ts가 1,000줄 상한을 넘지 않게 따로 둔다(app.ts가 다시 내보낸다).
import type { MapPropInput } from "@terra/planet/secondMap";
import type { ReplayName } from "@terra/protocol/battleReplay";
import type { EconomyCatalogResponse } from "@terra/shared/economy";
import type { RankingPathInfo } from "@terra/shared/ranking";
import type { LocalizedName } from "@terra/shared/roster";
import type { FastifyRequest } from "fastify";
import type { AuthSettings } from "./auth/auth.ts";
import type { AccountLimitName, LimitSetting } from "./auth/limits.ts";
import type { BalanceLimits } from "./balance/services.ts";
import type { AnalysisLimits } from "./battleLab/analysisJobs.ts";
import type { ReportLimits } from "./battleReport/services.ts";
import type { BattleLabLimits } from "./battleLab/services.ts";
import type { BattleReplayLimits } from "./battleReplay/services.ts";
import type { ContentEditState } from "./contentEdit/state.ts";
import type { Database } from "./db/client.ts";
import type { GatherKind } from "./gather/kinds.ts";
import type { PlanetBaker } from "./planet/baker.ts";
import type { PlanetRouteLimits } from "./planet/routes.ts";
import type { PlanetServiceOptions } from "./planet/service.ts";
import type { PlanetSource } from "./planet/sources.ts";
import type { PlanetEditorLimits } from "./planetEditor/services.ts";
import type { PlanetEditorDefinitions } from "./planetEditor/types.ts";
import type { NationNames } from "./ranking/paths.ts";
import type { RosterCatalog } from "./roster/catalog.ts";
import type { Viewer } from "./trpc/context.ts";
import type { TuningLimits } from "./tuning/services.ts";
import type { TuningState } from "./tuning/state.ts";
import type { WorldConfig } from "./world/world.ts";

/** 1차맵 행성(ADR 36): 원본마다 디스크 캐시를 읽거나 굽고 목록 정보·타일 경로를 연다 */
export interface AppPlanetsOptions {
  sources: readonly PlanetSource[];
  /** 굽는 곳. 운영은 워커(createWorkerBaker), 시험은 같은 스레드(createInlineBaker) */
  baker: PlanetBaker;
  /** 디스크 캐시 폴더(PLANET_CACHE_DIR). 없으면 캐시 없이 */
  cacheDir?: string | undefined;
  /** 시험용: 다시 굽기 지연, 속도 제한 */
  retryDelayMs?: PlanetServiceOptions["retryDelayMs"];
  limits?: Partial<PlanetRouteLimits> | undefined;
}

/** 인증 켜기(DB가 있을 때만). 없으면 /api/auth/*, /api/account/*는 404이고 tRPC는 늘 로그인하지 않은 상태 */
export interface AppAuthOptions {
  settings: AuthSettings;
  /** 새 아이디 가입 허용 (AUTH_OPEN_SIGNUP) */
  openSignup: boolean;
  /** 시험용: 시도 제한 숫자 바꾸기 */
  limits?: Partial<Record<AccountLimitName, LimitSetting>> | undefined;
}

export interface AppOptions {
  /** 콘텐츠 팩 버전 "<팩 ID>@<팩 버전>" (시험에서는 아무 문자열) */
  contentVersion: string;
  /** 콘텐츠 팩 해시(SHA-256). 없으면 /health에 넣지 않는다(시험용) */
  contentHash?: string | undefined;
  staticDir?: string | undefined;
  /** 서버 기록. 기본 true(표준 출력). 시험은 쓰기 대상(stream)을 넘겨 기록 줄을 본다 */
  logger?: boolean | { level: string; stream: { write(line: string): void } };
  now?: () => number;
  /** 없으면 DB 없이 뜬다(헬스체크의 db는 "off") */
  db?: Database | undefined;
  /** 서버 지표 기록 간격(ms). 0이면 기록하지 않는다 */
  metricsIntervalMs?: number;
  /** 믿는 프록시 주소 (기본: 루프백·사설 주소) */
  trustProxy?: string;
  /** 인증. db가 있어야 한다 */
  auth?: AppAuthOptions | undefined;
  /** S1 2차맵(시험 2차맵 + 경로 워커 + 시험용 봇). 없으면 2차맵 요청에 unknown_map, 지형 경로 없음 */
  world?: WorldConfig | undefined;
  /** 1차맵 행성(굽기·캐시·목록 정보·타일). 없으면 행성 경로 없음 */
  planets?: AppPlanetsOptions | undefined;
  /**
   * 행성 값에서 만든 2차맵(ADR 2026-10-31-second-map-from-planet WP-3): 월드 행성(시험 행성)이 planets에 있으면
   * 지형 서비스를 띄워 시험 2차맵 지형을 만든다. 없으면 S1 임시 지형. props = 콘텐츠 map_props(src/world/mapProps.ts)
   */
  secondMaps?:
    | {
        props: MapPropInput[];
        /** 그림 번호 → 느림 배율 표(팩 map_props slowPm, src/world/mapProps.ts mapPropSlowByArtFromPack). 없으면 느려짐 없음 */
        slowByArt?: Uint16Array | undefined;
        runner: { kind: "worker"; workerUrl: URL } | { kind: "inline" };
      }
    | undefined;
  /**
   * 행성 편집기(ADR 38): 서버가 켤 때 만든 정의 조회 자료(src/planetEditor/definitions.ts). 인증이 켜져 있어야 쓴다.
   * 없으면 planetEditor.* 는 권한 확인 뒤 NOT_FOUND(PLANET_EDITOR_UNAVAILABLE). limits는 시험용(속도 제한 숫자 바꾸기)
   */
  planetEditor?:
    | { definitions: PlanetEditorDefinitions; limits?: Partial<PlanetEditorLimits> | undefined }
    | undefined;
  /** 유닛·사이보그 화면의 콘텐츠 팩 자료(src/roster/catalog.ts rosterCatalogOf). 없으면 시험 자료(이름 = ID) */
  roster?: RosterCatalog | undefined;
  /**
   * 설정 칸 실효 값(팩 tuning + 이 세계 DB의 덮어쓰기, src/tuning/state.ts — docs/adr/2026-11-01-dev-settings-panel.md).
   * 사이보그 만들기·지원금·세력 화면이 쓸 때마다 읽는다. DB가 있으면 켤 때(onReady) 덮어쓰기를 싣고, 인증이 켜져 있으면
   * 개발자 패널(tuning.*)을 연다. 모든 세계에서 바로 든다(사용자 답 204·205). 없으면 sim 시험 계수표·패널 없음
   */
  tuning?: { state: TuningState; packId: string; limits?: Partial<TuningLimits> | undefined } | undefined;
  /**
   * 팩 항목 실효 값(스킬·무기·유닛 종류: 팩 + 이 세계 DB의 덮어쓰기, src/contentEdit/state.ts — docs/adr/2026-11-01-skill-editor.md).
   * 전투 자료(유닛 화면·정원사 웨이브 전투)가 쓸 때마다 읽는다(roster가 같은 접근자를 받는다). DB가 있으면 켤 때 덮어쓰기를 싣고,
   * tuning이 있으면 개발자 스킬 편집기(skills.*)를 연다. 없으면 팩 항목 그대로·편집기 없음
   */
  contentEdit?: { state: ContentEditState } | undefined;
  /**
   * 밸런스 화면 대결을 어디서 돌리나(docs/adr/2026-11-01-balance-screen.md 4절): 워커(요청마다 띄움) 또는 같은 스레드(시험).
   * 화면은 tuning이 있을 때만 연다. 없으면 같은 스레드
   */
  balance?:
    | {
        runner: { kind: "worker"; workerUrl: URL } | { kind: "inline" };
        limits?: Partial<BalanceLimits> | undefined;
      }
    | undefined;
  /**
   * 전투 실험실(같은 화면의 [전투 실험실] 탭, docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)"): 팩 유닛 종류 이름,
   * 시험용 속도 제한. 전투는 balance.runner와 같은 워커·같은 바쁨 표시. 화면은 tuning이 있을 때만 연다
   */
  battleLab?:
    | {
        unitKindNames?: ReadonlyMap<string, LocalizedName> | undefined;
        limits?: Partial<BattleLabLimits> | undefined;
        analysisLimits?: Partial<AnalysisLimits> | undefined;
        /** 전투 보고서 시험용 속도 제한(docs/adr/2026-11-14-battle-report.md) */
        reportLimits?: Partial<ReportLimits> | undefined;
      }
    | undefined;
  /**
   * 전투 다시보기 기록을 어디서 돌리나(docs/adr/2026-11-01-battle-replay.md 5절): 워커(요청마다 띄움) 또는 같은 스레드(시험).
   * 화면은 tuning이 있을 때만 연다. 없으면 같은 스레드. effectNames = 팩 효과 이름(없으면 ID)
   */
  battleReplay?:
    | {
        runner: { kind: "worker"; workerUrl: URL } | { kind: "inline" };
        effectNames?: Record<string, ReplayName> | undefined;
        limits?: Partial<BattleReplayLimits> | undefined;
      }
    | undefined;
  /**
   * 경제 화면 목록(팩 items·recipes 등, src/economyView/catalog.ts) 또는 그 접근자(실효 아이템, 아이템 편집기 덮어쓰기가 바로 든다).
   * 없으면 빈 목록
   */
  economyCatalog?: EconomyCatalogResponse | (() => EconomyCatalogResponse) | undefined;
  /**
   * 랭킹(docs/adr/2026-11-07-ranking.md): 팩 경로 목록(ranking_paths)·국가 프리셋 이름. DB와 월드가 있으면 집계 일정(하루 한 번 [임시],
   * 설정 칸 ranking_period)을 돌리고 ranking.* 조회가 집계 표를 읽는다. 없으면 빈 판
   */
  ranking?: { paths: readonly RankingPathInfo[]; nations?: NationNames | undefined } | undefined;
  /** 2차맵 원자재 오브젝트 종류(팩 gather_objects, docs/adr/2026-11-07-gather-objects.md). 없으면 채집 오브젝트가 없다 */
  gatherObjects?: readonly GatherKind[] | undefined;
  /**
   * 시험용: 요청의 로그인 사용자를 직접 정한다(DB 없는 시험). 주면 인증 세션 조회와 WebSocket 출처 검사를 하지 않는다.
   * 운영 코드는 쓰지 않는다.
   */
  testViewer?: ((request: FastifyRequest) => Promise<Viewer | null>) | undefined;
}
