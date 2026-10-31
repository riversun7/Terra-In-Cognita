// 주소 → 화면 표(ADR 2026-10-29-app-shell 1·11절). 화면은 모두 지연 로딩 조각이다(첫 화면 묶음에 넣지 않는다).
// 화면에 프레임 측정(monitor)·[뒤로](onClose = 화면 안 뒤로)·로그인한 사람을 넘기는 길도 여기다.
// 꽂는 줄: 다른 줄기가 자기 화면을 만들면 아래 lazy 한 줄만 바꾼다.
// 그 화면들은 { match } (+ 홈은 monitor)를 받는다: 검색어(?template=, ?item=)는 match.search에 있다.
// 화면 안 useMountFocus(ui/useMountFocus.ts)는 앱 안에서 옮겨 연 화면에서만 초점을 옮긴다(MountFocusContext):
// 주소로 바로 열거나 새로고침한 화면은 옮기지 않는다(ADR 37 1절). 앱 안 이동의 초점은 틀(Shell.tsx)도 새 화면 제목에 둔다.
// 주소 표에 줄이 늘면 ROUTE_TITLES·renderRoute에서 타입 오류가 난다.
import type { AccountView, RouteId, RouteMatch } from "@terra/shared";
import { type ReactNode, Suspense, lazy, useEffect } from "react";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { forceUpdate } from "../pwa/updates.ts";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { LiveMessage } from "../ui/LiveMessage.tsx";
import { MountFocusContext } from "../ui/useMountFocus.ts";
import { BackButton } from "./BackButton.tsx";
import { NoPermission } from "./NoPermission.tsx";
import { NotFound } from "./NotFound.tsx";
import { goBack, navigate } from "./routerStore.ts";

// 홈 대시보드(W4): 템플릿 6개·카드·편집 시트. 템플릿·편집 시트는 다시 따로 조각이다
const HomeScreen = lazy(() => import("../home/HomeScreen.tsx"));
// 처리할 일 화면(W3): ?item= 은 그 줄을 강조한다(초점은 앱 안 이동일 때만 틀이 옮긴다). [뒤로]는 화면 제목 줄 끝에 둔다
const InboxScreen = lazy(() => import("../inbox/InboxScreen.tsx"));
// 유닛 화면(목록·파티·직무 프리셋·관리인·경매소·포로)과 사이보그 화면(본체): units.list·cyborg.get(ADR 37 "구현하며 정한 것 (유닛·사이보그 화면)")
const UnitsScreen = lazy(() => import("../units/UnitsScreen.tsx"));
const CyborgScreen = lazy(() => import("../cyborg/CyborgScreen.tsx"));
// 경제(창고·생산·거래창·환전, ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)"): 칸마다 다시 따로 조각이다
const EconomyScreen = lazy(() => import("../economy/EconomyScreen.tsx"));
// 세력 화면(D-439, 기획 46): 내 세력·도시·외교·전쟁·투표·지분. 규칙 전 칸은 곧 열림, dev·admin은 시안 자료
const FactionScreen = lazy(() => import("../faction/FactionScreen.tsx"));
// 우편 화면(D-270): 받은·보낸 우편, 쓰기(칸 검사만, 보내기는 곧 열림)
const MailScreen = lazy(() => import("../mail/MailScreen.tsx"));
const SettingsPage = lazy(() => import("../settings/SettingsPage.tsx"));
const AdminPage = lazy(() => import("../admin/AdminPage.tsx"));
// 개발자 영역(ADR 38 1절). 셰이더 측정은 gpuBench…로 시작하는 진입 파일로 받는다(조각 이름 → 미리 캐시에서 빠짐)
const DevHome = lazy(() => import("../editor/DevHome.tsx"));
const GpuBenchPage = lazy(() => import("../editor/gpuBench/gpuBenchScreen.ts"));
// 행성 편집기(ADR 38 WP-D, 틀 숨김): 조각 이름 PlanetEditorScreen-*(미리 캐시 규칙 [Pp]lanetEditor). 엔진은 지도 화면과 같이 쓴다
const PlanetEditorScreen = lazy(() => import("../editor/planet/PlanetEditorScreen.tsx"));
// 항성계 편집기(ADR 2026-10-31-star-system-editor, 틀 숨김): 조각 이름 StarSystemScreen-*(미리 캐시 규칙 [Ss]tarSystem)
const StarSystemScreen = lazy(() => import("../editor/starSystem/StarSystemScreen.tsx"));
// 지도: Three.js·엔진은 이 조각들과 함께만 내려온다. 떠나면 내린다(ADR 37 11절). 화면은 { onClose, monitor }만 받는다
const SecondaryMapScreen = lazy(() => import("../map/SecondaryMapScreen.tsx"));
const PlanetMapScreen = lazy(() => import("../map/PlanetMapScreen.tsx"));

/** 화면 이름(문서 제목 `document.title`) */
export const ROUTE_TITLES = {
  home: m.nav_home,
  map: m.map_title,
  map_planet: m.planet_title,
  units: m.nav_units,
  economy: m.nav_economy,
  economy_warehouse: m.economy_tab_warehouse,
  economy_production: m.economy_tab_production,
  economy_market: m.economy_market_title,
  economy_market_item: m.economy_market_title,
  economy_market_city: m.economy_market_title,
  economy_orders: m.economy_my_orders,
  economy_exchange: m.economy_tab_exchange,
  faction: m.nav_faction,
  cyborg: m.nav_cyborg,
  inbox: m.shell_route_inbox,
  mail: m.shell_mail,
  settings: m.settings_title,
  admin: m.admin_title,
  dev: m.shell_dev,
  dev_planet_editor: m.shell_route_dev_planet_editor,
  dev_star_system: m.shell_route_dev_star_system,
  dev_gpu_bench: m.shell_route_dev_gpu_bench,
} satisfies Record<RouteId, () => string>;

/** 문서 제목: "<화면> · 테라 인코그니타". 없는 화면·권한 없음은 그 안내 제목 */
export function documentTitle(match: RouteMatch | null, allowed: boolean): string {
  const screen =
    match === null
      ? m.shell_not_found_title()
      : allowed
        ? ROUTE_TITLES[match.id]()
        : m.shell_no_permission_title();
  return m.shell_document_title({ screen });
}

/** 지연 로딩 조각을 못 불러왔을 때. [다시 시도]는 강제 적용(새 버전, 없으면 새로고침)이다 */
function ChunkLoadFailed({ message }: { message: string }) {
  return (
    <section className="screen">
      <LiveMessage tone="error" lines={[message]} />
      <div className="form-actions">
        <button type="button" onClick={() => void forceUpdate("manual")}>
          {m.retry()}
        </button>
      </div>
    </section>
  );
}

/** 지연 로딩 화면의 불러오는 중·실패 문구. 지도·관리자·설정은 전부터 쓰던 문구, 나머지는 공용 문구 */
function lazyText(id: RouteId): { loading: string; failed: string } {
  switch (id) {
    case "map":
      return { loading: m.map_loading(), failed: m.map_load_failed() };
    case "map_planet":
      return { loading: m.planet_loading(), failed: m.planet_load_failed() };
    case "admin":
      return { loading: m.admin_loading(), failed: m.admin_load_failed() };
    case "settings":
      return { loading: m.settings_loading(), failed: m.settings_load_failed() };
    default:
      return { loading: m.shell_loading(), failed: m.shell_load_failed() };
  }
}

/**
 * 화면이 그려졌다는 신호 — 지연 로딩 화면과 같은 Suspense 안에 두어, 화면이 실제로 그려진 뒤에 부른다.
 * 그때 틀이 문서 제목·스크롤·초점을 맞춘다(Shell.tsx). 주소가 바뀔 때마다(version) 다시 부른다.
 */
function RouteSettled({ version, onSettled }: { version: number; onSettled: (version: number) => void }) {
  useEffect(() => {
    onSettled(version);
  }, [version, onSettled]);
  return null;
}

interface RouteViewProps {
  match: RouteMatch | null;
  /** 이 계정의 역할로 여는 화면인지(canOpenRoute) */
  allowed: boolean;
  user: AccountView;
  monitor: FrameMonitor;
  version: number;
  /** 앱 안에서 옮겨 연 화면인지(라우터 via가 initial이 아님). 아니면 화면이 마운트 때 초점을 옮기지 않는다 */
  openedInApp: boolean;
  onSettled: (version: number) => void;
}

function renderRoute(match: RouteMatch, user: AccountView, monitor: FrameMonitor): ReactNode {
  switch (match.id) {
    case "home":
      return <HomeScreen match={match} monitor={monitor} />;
    case "map":
      return <SecondaryMapScreen onClose={goBack} monitor={monitor} />;
    case "map_planet":
      return <PlanetMapScreen onClose={goBack} monitor={monitor} />;
    case "inbox":
      return <InboxScreen itemId={match.search.item} onNavigate={navigate} headerEnd={<BackButton />} />;
    case "settings":
      return <SettingsPage onClose={goBack} />;
    case "admin":
      return <AdminPage viewer={user} onClose={goBack} />;
    case "dev":
      return <DevHome />;
    case "dev_gpu_bench":
      return <GpuBenchPage />;
    case "dev_planet_editor":
      return <PlanetEditorScreen onClose={goBack} monitor={monitor} />;
    case "dev_star_system":
      return <StarSystemScreen onClose={goBack} onNavigate={navigate} />;
    case "faction":
      return <FactionScreen />;
    case "mail":
      return <MailScreen />;
    case "units":
      return <UnitsScreen />;
    case "cyborg":
      return <CyborgScreen />;
    case "economy":
    case "economy_warehouse":
    case "economy_production":
    case "economy_market":
    case "economy_market_item":
    case "economy_market_city":
    case "economy_orders":
    case "economy_exchange":
      return <EconomyScreen match={match} user={user} />;
    default: {
      // 주소 표에 줄이 늘면 여기서 타입 오류가 난다
      const unhandled: never = match;
      return unhandled;
    }
  }
}

/** 지금 주소의 화면. 없는 화면·권한 없음은 첫 화면 묶음의 작은 화면이라 바로 그린다 */
export function RouteView({
  match,
  allowed,
  user,
  monitor,
  version,
  openedInApp,
  onSettled,
}: RouteViewProps) {
  if (match === null || !allowed) {
    return (
      <>
        {match === null ? <NotFound /> : <NoPermission />}
        <RouteSettled version={version} onSettled={onSettled} />
      </>
    );
  }
  const text = lazyText(match.id);
  return (
    <MountFocusContext value={openedInApp}>
      <ChunkErrorBoundary key={match.id} fallback={<ChunkLoadFailed message={text.failed} />}>
        <Suspense
          fallback={
            <p className="status shell-loading" role="status">
              {text.loading}
            </p>
          }
        >
          {renderRoute(match, user, monitor)}
          <RouteSettled version={version} onSettled={onSettled} />
        </Suspense>
      </ChunkErrorBoundary>
    </MountFocusContext>
  );
}
