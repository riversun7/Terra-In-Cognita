// 홈(대시보드) — 로그인 직후 첫 화면(`/`, D-6001). ADR 2026-10-29-app-shell 6절.
// - 화면 틀(W1)의 주소 → 화면 표(shell/routeViews.tsx)가 지연 로딩해 { match, monitor }를 넘긴다(W1의 임시 홈과 같은 받는 값).
//   틀이 <main>·위 띠·탭을 그리고, 이 화면은 제목(h1)부터 그린다. 넓게 쓰는 화면이라 .screen-wide(틀 본문 --content-max-wide)다.
//   앱 안에서 옮겨 왔을 때 틀이 h1(#home-title, tabIndex -1)에 초점을 둔다.
// - 템플릿: 플레이어는 늘 조합(DT-HYBRID). dev·admin은 저장한 템플릿 또는 주소 ?template=(저장하지 않음)을 본다(사용자 결정 2).
//   조합은 이 조각에 함께 넣고, 나머지 다섯은 템플릿마다 따로 받는다.
// - 자료는 템플릿과 따로다(같은 훅 useHomeData). 카드 고르기·순서·크기는 user_settings.home(homeSettings.ts)이다.
//   시안 자료 스위치는 처리함·종 배지·복귀 요약과 같은 하나다(inboxParts.ts usePreviewOn, W3 inbox/preview.ts).
// - 편집 시트는 [편집]을 누를 때 받는다(따로 된 조각). 가리키거나 초점이 가면 미리 받는다. 받는 중·실패 안내는 [편집] 바로 아래에 보이고 읽힌다.
// - 원격 측정 화면 이름: home:<템플릿>(ADR 37 6절 "D-6005 판단 자료"). 홈을 떠나면 지운다.
import type { Role, RouteMatch } from "@terra/shared";
import { type HomeTemplate, parseHome } from "@terra/shared/dashboard";
import { type ComponentType, Suspense, lazy, useEffect, useMemo, useRef } from "react";
import { useSession } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import type { FrameMonitor } from "../perf/frameMonitor.ts";
import { forceUpdate } from "../pwa/updates.ts";
import { setTelemetryView } from "../telemetry/reporter.ts";
import { ChunkErrorBoundary } from "../ui/ChunkErrorBoundary.tsx";
import { LiveMessage } from "../ui/LiveMessage.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { text } from "../ui/text.ts";
import { PencilIcon } from "./cards/icons.tsx";
import type { HomeData } from "./homeData.ts";
import { useStoredHome } from "./homeSettings.ts";
import type { TemplateProps } from "./homeTypes.ts";
import { canUseHomeTools, chooseTemplate, gridCards, homeNeeds } from "./homeView.ts";
import { INBOX_TEXT, usePreviewOn } from "./inboxParts.ts";
import { useSheetOverlay } from "./shellParts.tsx";
import HybridTemplate from "./templates/HybridTemplate.tsx";
import { templateName } from "./templateText.ts";
import { useHomeData } from "./useHomeData.ts";
import "./home.css";
import "./dashboardPro.css";

export interface HomeScreenProps {
  /** 지금 주소(matchPath 결과). ?template=은 dev·admin에게만 듣는다 */
  readonly match: Extract<RouteMatch, { readonly id: "home" }>;
  readonly monitor: FrameMonitor;
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

/**
 * 지연 조각을 못 받았을 때. [다시 시도]는 강제 적용(새 버전, 없으면 새로고침)이다(App.tsx와 같다).
 * onDismiss가 있으면 [닫기]도 둔다(편집 시트: 홈은 그대로 쓸 수 있다)
 */
function ChunkFailed({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="home-chunk-failed">
      <LiveMessage tone="error" lines={[message]} />
      <div className="form-actions">
        <button type="button" onClick={() => void forceUpdate("manual")}>
          {m.retry()}
        </button>
        {onDismiss === undefined ? null : (
          <button type="button" onClick={onDismiss}>
            {m.home_edit_close()}
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateView({ template, ...props }: TemplateProps & { template: HomeTemplate }) {
  if (template === "dt_hybrid") return <HybridTemplate {...props} />;
  const Template = LAZY_TEMPLATES[template];
  // 템플릿마다 새 경계: 한 템플릿 조각을 못 받아도(오프라인) 다른 템플릿으로 바꾸면 다시 받는다
  return (
    <ChunkErrorBoundary key={template} fallback={<ChunkFailed message={m.home_template_failed()} />}>
      <Suspense fallback={<p className="home-muted">{m.home_template_loading()}</p>}>
        <Template {...props} />
      </Suspense>
    </ChunkErrorBoundary>
  );
}

/** 받지 못한 부분의 안내 줄: "홈 자료를 받지 못했습니다." + 까닭(겹치는 까닭은 한 번) */
function failureLines(data: HomeData): string[] {
  const reasons = new Set<string>();
  for (const part of [data.inbox, data.cards, data.summary]) {
    if (part.status === "failed") reasons.add(text({ key: part.error }));
  }
  return reasons.size === 0 ? [] : [m.home_data_failed(), ...reasons];
}

export default function HomeScreen({ match, monitor }: HomeScreenProps) {
  const session = useSession();
  const roles = session.kind === "signed_in" ? session.user.roles : NO_ROLES;
  const tools = canUseHomeTools(roles);
  const stored = useStoredHome();
  const home = useMemo(() => parseHome(stored, roles), [stored, roles]);
  const choice = chooseTemplate(roles, home.template, match.search.template);
  const { template } = choice;
  // 켠 계정이 로그인해 있고 dev·admin일 때만 켜진다(서버가 요청마다 다시 본다)
  const preview = usePreviewOn();
  const cards = useMemo(() => gridCards(template, home.cards), [template, home.cards]);
  const needs = useMemo(() => homeNeeds(template, home.cards, preview), [template, home.cards, preview]);
  const { data, refresh } = useHomeData(needs);
  const failed = failureLines(data);
  // 편집 시트의 열림(W1 뒤에는 라우터의 겹침 칸: 뒤로 → 닫힘, shellParts.tsx)
  const sheet = useSheetOverlay();
  const sheetOpen = sheet.open;
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const sheetWasOpen = useRef(false);

  // 시트가 닫히면 연 단추로 초점을 돌려준다(ADR 37 10절). 닫는 길이 여럿이라(Esc·[닫기]·바탕 누르기, W1 뒤에는 뒤로도)
  // 닫기 처리기가 아니라 열림이 꺼진 것을 본다. 뒤로로 닫히면 시트가 초점을 든 채 DOM에서 빠진다
  useEffect(() => {
    if (sheetWasOpen.current && !sheetOpen) editButtonRef.current?.focus();
    sheetWasOpen.current = sheetOpen;
  }, [sheetOpen]);

  // 원격 측정 화면 이름(성능 표본이 템플릿마다 쌓인다). 플레이어는 늘 home:dt_hybrid
  useEffect(() => {
    setTelemetryView(`home:${template}`);
    return () => setTelemetryView(null);
  }, [template]);

  return (
    <section className="screen screen-wide home" aria-labelledby="home-title" data-template={template}>
      <div className="home-header">
        <h1 id="home-title" className="screen-title" tabIndex={-1}>
          {m.nav_home()}
        </h1>
        <button
          ref={editButtonRef}
          type="button"
          className="button-small home-edit-button"
          aria-haspopup="dialog"
          onClick={sheet.show}
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
      {sheet.open ? (
        // 편집 조각을 받는 동안·못 받았을 때의 안내는 [편집] 바로 아래(시트 자체는 맨 위 층에 뜬다)
        <ChunkErrorBoundary fallback={<ChunkFailed message={m.home_edit_failed()} onDismiss={sheet.hide} />}>
          <Suspense fallback={<LiveMessage tone="info" lines={[m.home_edit_loading()]} />}>
            <EditSheet
              template={template}
              savedTemplate={home.template}
              templateFromAddress={choice.from === "address"}
              cards={home.cards}
              roles={roles}
              preview={preview}
              onClose={sheet.hide}
            />
          </Suspense>
        </ChunkErrorBoundary>
      ) : null}
      {preview ? (
        <p className="home-note">
          <StatusIcon tone="info" />
          <span>{INBOX_TEXT.previewNotice()}</span>
        </p>
      ) : null}
      <LiveMessage className="home-live" tone="error" lines={failed} />
      {failed.length > 0 ? (
        <div className="form-actions home-retry">
          <button type="button" onClick={refresh}>
            {m.retry()}
          </button>
        </div>
      ) : null}
      <TemplateView template={template} cards={cards} data={data} monitor={monitor} />
    </section>
  );
}
