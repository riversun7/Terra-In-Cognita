// 홈(대시보드) — 로그인 직후 첫 화면(`/`, D-6001). ADR 2026-10-29-app-shell 6절.
// - 화면 틀(W1)의 주소 → 화면 표(shell/routeViews.tsx)가 지연 로딩해 { monitor, search }를 넘긴다. 틀이 <main>·위 띠·탭을 그리고,
//   이 화면은 제목(h1)부터 그린다. 앱 안에서 옮겨 왔을 때 틀이 h1(#home-title, tabIndex -1)에 초점을 둔다.
// - 템플릿: 플레이어는 늘 조합(DT-HYBRID). dev·admin은 저장한 템플릿 또는 주소 ?template=(저장하지 않음)을 본다(사용자 결정 2).
//   조합은 이 조각에 함께 넣고, 나머지 다섯은 템플릿마다 따로 받는다.
// - 자료는 템플릿과 따로다(같은 훅 useHomeData). 카드 고르기·순서·크기는 user_settings.home(homeSettings.ts)이다.
// - 편집 시트는 [편집]을 누를 때 받는다(따로 된 조각). 가리키거나 초점이 가면 미리 받는다.
// - 원격 측정 화면 이름: home:<템플릿>(ADR 37 6절 "D-6005 판단 자료"). 홈을 떠나면 지운다.
import type { Role } from "@terra/shared";
import { type HomeTemplate, parseHome } from "@terra/shared/dashboard";
import type { InboxItem } from "@terra/shared/inbox";
import { type ComponentType, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { forceUpdate } from "../pwa/updates.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { PencilIcon } from "./cards/icons.tsx";
import { usePreviewOn } from "./homePrefs.ts";
import { useStoredHome } from "./homeSettings.ts";
import type { TemplateProps } from "./homeTypes.ts";
import { canUseHomeTools, chooseTemplate, gridCards, homeNeeds } from "./homeView.ts";
import HybridTemplate from "./templates/HybridTemplate.tsx";
import { templateName } from "./templateText.ts";
import { useHomeData } from "./useHomeData.ts";
import "./home.css";

export interface HomeScreenProps {
  readonly monitor: FrameMonitor;
  /** 주소의 검색어(matchPath 결과의 search). ?template=은 dev·admin에게만 듣는다 */
  readonly search?: { readonly template?: string | undefined } | undefined;
}

/** 조합 밖의 템플릿 — 템플릿마다 따로 받는다(dev·admin만 쓴다) */
const LAZY_TEMPLATES: { readonly [T in Exclude<HomeTemplate, "dt_hybrid">]: ComponentType<TemplateProps> } = {
  dt_grid: lazy(() => import("./templates/GridTemplate.tsx")),
  dt_inbox: lazy(() => import("./templates/InboxTemplate.tsx")),
  dt_timeline: lazy(() => import("./templates/TimelineTemplate.tsx")),
  dt_city: lazy(() => import("./templates/CityTemplate.tsx")),
  dt_brief: lazy(() => import("./templates/BriefTemplate.tsx")),
};

const loadEditSheet = () => import("./edit/EditSheet.tsx");
const EditSheet = lazy(loadEditSheet);

/** [편집]을 가리키거나 초점이 가면 편집 조각을 미리 받는다(누를 때 기다리지 않게). 실패는 누를 때 다시 알린다 */
function preloadEditor(): void {
  loadEditSheet().catch(() => undefined);
}

/** 로그인하지 않았을 때(틀이 홈을 그리지 않지만 타입상 필요) */
const NO_ROLES: readonly Role[] = [];

/** 지연 조각을 못 받았을 때. [다시 시도]는 강제 적용(새 버전, 없으면 새로고침)이다(App.tsx와 같다) */
function ChunkFailed({ message }: { message: string }) {
  return (
    <div className="home-chunk-failed">
      <LiveMessage tone="error" lines={[message]} />
      <div className="form-actions">
        <button type="button" onClick={() => void forceUpdate("manual")}>
          {m.retry()}
        </button>
      </div>
    </div>
  );
}

function TemplateView({ template, ...props }: TemplateProps & { template: HomeTemplate }) {
  if (template === "dt_hybrid") return <HybridTemplate {...props} />;
  const Template = LAZY_TEMPLATES[template];
  return (
    <ChunkErrorBoundary fallback={<ChunkFailed message={m.home_template_failed()} />}>
      <Suspense fallback={<p className="home-muted">{m.home_template_loading()}</p>}>
        <Template {...props} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}

export default function HomeScreen({ monitor, search }: HomeScreenProps) {
  const session = useSession();
  const roles = session.kind === "signed_in" ? session.user.roles : NO_ROLES;
  const tools = canUseHomeTools(roles);
  const stored = useStoredHome();
  const home = useMemo(() => parseHome(stored, roles), [stored, roles]);
  const choice = chooseTemplate(roles, home.template, search?.template);
  const { template } = choice;
  const previewOn = usePreviewOn();
  const preview = tools && previewOn;
  const cards = useMemo(() => gridCards(template, home.cards), [template, home.cards]);
  const needs = useMemo(() => homeNeeds(template, home.cards, preview), [template, home.cards, preview]);
  const { data, refresh } = useHomeData(needs);
  const failed = [data.inbox, data.cards, data.summary].some((part) => part.status === "failed");
  const notice = useLiveLines();
  const { show: showNotice } = notice;
  const [editing, setEditing] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  // 원격 측정 화면 이름(성능 표본이 템플릿마다 쌓인다). 플레이어는 늘 home:dt_hybrid
  useEffect(() => {
    setTelemetryView(`home:${template}`);
    return () => setTelemetryView(null);
  }, [template]);

  const onQuickAction = useCallback(
    (item: InboxItem, _action: string) => {
      // 시안 자료는 명령을 보내지 않는다(ADR 37 6절)
      if (item.preview === true) {
        showNotice([m.home_preview_action()]);
        return;
      }
      // [임시] W3 뒤(꽂는 줄): inbox/quickActions.ts로 보내고(WebSocket inbox_action), 결과를 받으면 refresh()로 다시 받는다.
      // 지금은 시안 자료 말고는 처리할 일 종류가 없어 여기에 오지 않는다
    },
    [showNotice],
  );

  const closeEditor = useCallback(() => {
    setEditing(false);
    // 시트를 닫으면 연 단추로 초점을 돌려준다(ADR 37 10절)
    editButtonRef.current?.focus();
  }, []);

  return (
    <section className="screen home" aria-labelledby="home-title" data-template={template}>
      <div className="home-header">
        <h1 id="home-title" className="screen-title" tabIndex={-1}>
          {m.nav_home()}
        </h1>
        <button
          ref={editButtonRef}
          type="button"
          className="button-small home-edit-button"
          aria-haspopup="dialog"
          onClick={() => setEditing(true)}
          onPointerEnter={preloadEditor}
          onFocus={preloadEditor}
        >
          <PencilIcon />
          <span>{m.home_edit()}</span>
        </button>
        {tools ? (
          <p className="home-tags">
            <span className="home-tag">{m.home_template_label({ name: templateName(template) })}</span>
            {choice.from === "address" ? (
              <span className="home-tag home-tag-note">{m.home_template_url()}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      {preview ? (
        <p className="home-note">
          <StatusIcon tone="info" />
          <span>{m.home_preview_on()}</span>
        </p>
      ) : null}
      <LiveMessage className="home-live" tone="error" lines={failed ? [m.home_data_failed()] : []} />
      {failed ? (
        <div className="form-actions home-retry">
          <button type="button" onClick={refresh}>
            {m.retry()}
          </button>
        </div>
      ) : null}
      <LiveMessage className="home-live" tone="info" lines={notice.lines} version={notice.version} />
      <TemplateView
        template={template}
        cards={cards}
        data={data}
        monitor={monitor}
        onQuickAction={onQuickAction}
      />
      {editing ? (
        <ChunkErrorBoundary fallback={<ChunkFailed message={m.home_edit_failed()} />}>
          <Suspense fallback={<p className="home-muted">{m.home_edit_loading()}</p>}>
            <EditSheet
              template={template}
              savedTemplate={home.template}
              templateFromAddress={choice.from === "address"}
              cards={home.cards}
              roles={roles}
              preview={preview}
              onClose={closeEditor}
            />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
    </section>
  );
}
