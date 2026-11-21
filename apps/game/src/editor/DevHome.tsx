// 개발자 홈(/dev) — 개발자 도구 목록(ADR 2026-10-29-planet-editor-stage1 1절 "개발자 도구 한곳").
// - dev·admin만 연다(주소 표 access. 다른 역할은 틀이 권한 없음 화면을 그린다). 화면에서 가리는 것은 편의이고,
//   서버 자료를 쓰는 도구는 서버가 요청마다 권한을 본다.
// - 도구마다 한 줄: 아이콘, 이름(주소 표의 화면 이름과 같은 키), 한 줄 설명. 누르면 그 도구 화면을 쌓는다(부모 dev, ADR 37 2절).
// - 도구 목록은 주소 표에서 부모가 dev인 줄과 같다. 줄이 늘면 DEV_TOOLS에서 타입 오류가 난다(나중 도구도 한 줄씩 더한다).
// - 이 조각은 미리 캐시된다(작은 목록이다). 도구 조각은 이름 앞머리(gpuBench·planetEditor·starSystem·secondMapLab·tuningPanel·balancePanel·
//   skillEditor·itemEditor·buildingEditor·territoryLab·contentEditor·battleReplayLab)로
//   미리 캐시에서 빠진다.
import { ROUTES, type RouteId, canOpenRoute } from "@terra/shared";
import { useSession } from "../auth/session.ts";
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { getLocale } from "../paraglide/runtime.js";
import { VersionRow } from "../settings/VersionRow.tsx";
import { AppLink } from "../shell/AppLink.tsx";
import { BackButton } from "../shell/BackButton.tsx";
import { Icon } from "../ui/icons.tsx";
import {
  CrateIcon,
  DiceIcon,
  FlaskIcon,
  ForwardIcon,
  GaugeIcon,
  HouseIcon,
  OrbitIcon,
  PawIcon,
  CrestIcon,
  PersonCardIcon,
  ScaleIcon,
  SlidersIcon,
  SparkIcon,
  TerritoryIcon,
  GlobePinIcon,
} from "./devIcons.tsx";
import "./devHome.css";

/** 개발자 도구 주소 = 주소 표에서 부모가 dev인 줄 */
type DevToolRoute = {
  [Id in RouteId]: (typeof ROUTES)[Id]["parent"] extends "dev" ? Id : never;
}[RouteId];

interface DevTool {
  readonly name: () => string;
  readonly desc: () => string;
  readonly mark: ReactNode;
  readonly tagKo: string;
  readonly tagEn: string;
  /** false: 화면이 아직 준비 중 화면이다(줄에 "준비 중"을 붙인다). 그 도구 화면을 붙이면 true로 바꾼다 */
  readonly ready: boolean;
}

/** 도구마다 이름·설명·아이콘·분류 표지 */
const DEV_TOOLS = {
  // 행성 편집기 화면(ADR 38 WP-D)
  dev_planet_editor: {
    name: m.shell_route_dev_planet_editor,
    desc: m.dev_tool_planet_editor_desc,
    mark: <Icon name="globe" />,
    tagKo: "3D WORLD · S2",
    tagEn: "3D WORLD · S2",
    ready: true,
  },
  // 항성계 편집기(ADR 2026-10-31-star-system-editor)
  dev_star_system: {
    name: m.shell_route_dev_star_system,
    desc: m.dev_tool_star_system_desc,
    mark: <OrbitIcon />,
    tagKo: "ORBIT · 공전·자전",
    tagEn: "ORBIT · System",
    ready: true,
  },
  // 2차맵 시험(ADR 46 "구현하며 정한 것 (개발자 2차맵 시험)"): 시각·자리·고저 과장을 바꿔 보는 보기 전용 화면
  dev_second_map: {
    name: m.shell_route_dev_second_map,
    desc: m.dev_tool_second_map_desc,
    mark: <Icon name="map" />,
    tagKo: "VIEWER · 지형",
    tagEn: "VIEWER · Terrain",
    ready: true,
  },
  // 설정 칸 패널(docs/adr/2026-11-01-dev-settings-panel.md): 49 설정 칸을 보고 그 세계에서 바로 바꾼다
  dev_tuning: {
    name: m.shell_route_dev_tuning,
    desc: m.dev_tool_tuning_desc,
    mark: <SlidersIcon />,
    tagKo: "LIVE CONFIG · 49 N53",
    tagEn: "LIVE CONFIG · 49 N53",
    ready: true,
  },
  // NPC 자율행동 · AI 에디터(docs/adr/2026-11-20-npc-autonomous-ai.md): 7축 성향 범위·조직 합성·충성도 곡선·전략·전투·판단 실험실
  dev_npc_ai: {
    name: m.shell_route_dev_npc_ai,
    desc: m.dev_tool_npc_ai_desc,
    mark: <SlidersIcon />,
    tagKo: "LIVE AI · 7축·충성도",
    tagEn: "LIVE AI · 7-Axis & Loyalty",
    ready: true,
  },
  // 밸런스·전투 보고서(docs/adr/2026-11-14-battle-report.md): 팀·유닛 편집 + 실제 판정 N판 보고서·기록
  dev_balance: {
    name: m.shell_route_dev_balance,
    desc: m.dev_tool_balance_desc,
    mark: <ScaleIcon />,
    tagKo: "SIMULATOR · 보고서",
    tagEn: "SIMULATOR · Reports",
    ready: true,
  },
  // 2차 스탯 에디터(가중치·공식 + 1차 영향력·계열별 성장·K 편차·확률 체감 그래프)
  dev_secondary_stats: {
    name: m.shell_route_dev_secondary_stats,
    desc: m.dev_tool_secondary_stats_desc,
    mark: <ScaleIcon />,
    tagKo: "CHARTS · 2차 스탯",
    tagEn: "CHARTS · Secondary",
    ready: true,
  },
  // 유닛 공통 경험치 테이블 에디터(/dev/exp-table): Lv 1~60 경험치 표 편집·곡선 생성·수명 대비 도달 기간 차트
  dev_exp_table: {
    name: m.shell_route_dev_exp_table,
    desc: m.dev_tool_exp_table_desc,
    mark: <GaugeIcon />,
    tagKo: "LIVE EDIT · 경험치 Lv 1~60",
    tagEn: "LIVE EDIT · EXP Lv 1–60",
    ready: true,
  },
  // 스킬 편집기·행동별 소모(docs/adr/2026-11-01-skill-editor.md): 스킬마다 모든 칸·특수 효과, 행동별 스태미나·MP
  dev_skills: {
    name: m.shell_route_dev_skills,
    desc: m.dev_tool_skills_desc,
    mark: <SparkIcon />,
    tagKo: "LIVE EDIT · 스킬",
    tagEn: "LIVE EDIT · Skills",
    ready: true,
  },
  // 아이템 편집기(docs/adr/2026-11-01-item-editor.md): 아이템마다 모든 칸·분류 자료, 서버가 셈하는 미리 보기, 담기 → 적용
  dev_items: {
    name: m.shell_route_dev_items,
    desc: m.dev_tool_items_desc,
    mark: <CrateIcon />,
    tagKo: "LIVE EDIT · 매장량 P1~P4",
    tagEn: "LIVE EDIT · Reserves P1~P4",
    ready: true,
  },
  // 효과 사전(docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)"): 아이템·스킬이 같이 쓰는 효과(D-425), 효과마다 쓰는 곳
  dev_effects: {
    name: m.shell_route_dev_effects,
    desc: m.dev_tool_effects_desc,
    mark: <FlaskIcon />,
    tagKo: "LIVE EDIT · 효과 D-425",
    tagEn: "LIVE EDIT · Effects D-425",
    ready: true,
  },
  // 건물 편집기(docs/adr/2026-11-02-building-editor.md): 시설마다 레벨 구간별 건설 재료·자리·채집 칸·2차맵 모습(3D 미리 보기)
  dev_buildings: {
    name: m.shell_route_dev_buildings,
    desc: m.dev_tool_buildings_desc,
    mark: <HouseIcon />,
    tagKo: "LIVE EDIT · 2차맵 모습",
    tagEn: "LIVE EDIT · Map look",
    ready: true,
  },
  // 생산 편집기(docs/adr/2026-11-11-production-six.md): 1차 생산 여섯 가지 스탯 짝·사다리·미리 보기, 확률 분포(옛 1차 생산 티어 확률 화면),
  // 스탯 매핑, 전투 클래스, 개요
  dev_production: {
    name: m.shell_route_dev_production,
    desc: m.dev_tool_production_desc,
    mark: <DiceIcon />,
    tagKo: "LIVE EDIT · 1차 생산 6종·N43",
    tagEn: "LIVE EDIT · Six gathers · N43",
    ready: true,
  },
  // 크리처 편집기(/dev/creatures): 크리처 카탈로그·원형 초상화 영역 선택·특성 스탯 분배·고유 무기 범위·드롭 시뮬레이터
  dev_creatures: {
    name: m.shell_route_dev_creatures,
    desc: m.dev_tool_creatures_desc,
    mark: <PawIcon />,
    tagKo: "LIVE EDIT · 초상화·스탯·무기",
    tagEn: "LIVE EDIT · Portrait & Stats",
    ready: true,
  },
  // 시작 국가 설정(docs/adr/2026-11-10-nation-editor.md): 국가 프리셋 이름·화폐·국가 마크·시작 조건·국가마다 씨앗 값
  dev_nations: {
    name: m.shell_route_dev_nations,
    desc: m.dev_tool_nations_desc,
    mark: <CrestIcon />,
    tagKo: "LIVE EDIT · 이름·마크·시작 수",
    tagEn: "LIVE EDIT · Names & Emblems",
    ready: true,
  },
  // 영토 층(docs/adr/2026-11-03-territory-layer.md): 도시·비콘 볼록 껍질, 겹침 규칙, 1차맵 칸 표, 시험 세력 비콘 놓기
  dev_territory: {
    name: m.shell_route_dev_territory,
    desc: m.dev_tool_territory_desc,
    mark: <TerritoryIcon />,
    tagKo: "TERRITORY · 볼록 껍질",
    tagEn: "TERRITORY · Hull",
    ready: true,
  },
  // 세계 배치(기획 D-528): 행성 평면 지도에 고정 NPC 국가 자리를 놓는다(다음 서버 시작 때 든다)
  dev_world_layout: {
    name: m.shell_route_dev_world_layout,
    desc: m.dev_tool_world_layout_desc,
    mark: <GlobePinIcon />,
    tagKo: "WORLD · 국가 자리",
    tagEn: "WORLD · Nation homes",
    ready: true,
  },
  // 구인 카드 시험(D-469): 도시마다 내 카드·도시 주인(NPC) 카드, WebSocket으로 고용해 본다(행정 건물 화면 전)
  // 지형 오브젝트 편집기(기획 D-536·D-398): 지형마다 2차맵 오브젝트 종류·양, 차이 내보내기
  // 채집 오브젝트 편집기(기획 D-552): 오브젝트마다 3D 모델·대표 아이템·양·티어 범위·나오는 2차맵 지형, 차이 내보내기
  dev_gather_objects: {
    name: m.shell_route_dev_gather_objects,
    desc: m.dev_tool_gather_objects_desc,
    mark: <CrateIcon />,
    tagKo: "EXPORT · 채집 D-552",
    tagEn: "EXPORT · Gather D-552",
    ready: true,
  },
  dev_terrain_objects: {
    name: m.shell_route_dev_terrain_objects,
    desc: m.dev_tool_terrain_objects_desc,
    mark: <Icon name="map" />,
    tagKo: "3D LAB · 지형·오브젝트 D-536",
    tagEn: "3D LAB · Terrain & Objects",
    ready: true,
  },
  dev_recruit: {
    name: m.shell_route_dev_recruit,
    desc: m.dev_tool_recruit_desc,
    mark: <PersonCardIcon />,
    tagKo: "LIVE TEST · 구인",
    tagEn: "LIVE TEST · Recruit",
    ready: true,
  },
  // 전투 다시보기(docs/adr/2026-11-01-battle-replay.md): 시범 6 대 6을 서버에서 기록해 3D 지도에서 되감고 배속으로 본다
  dev_battle_replay: {
    name: m.shell_route_dev_battle_replay,
    desc: m.dev_tool_battle_replay_desc,
    mark: <ForwardIcon />,
    tagKo: "3D REPLAY · 6v6",
    tagEn: "3D REPLAY · 6v6",
    ready: true,
  },
  // 운영 권한 부여(docs/adr/2026-11-08-operator-roles-log-switch.md): 개발자만 — 계정마다 운영 권한 체크박스
  dev_ops_grants: {
    name: m.shell_route_dev_ops_grants,
    desc: m.dev_tool_ops_grants_desc,
    mark: <Icon name="admin" />,
    tagKo: "ACCESS · 개발자 전용",
    tagEn: "ACCESS · Developer only",
    ready: true,
  },
  dev_gpu_bench: {
    name: m.shell_route_dev_gpu_bench,
    desc: m.dev_tool_gpu_bench_desc,
    mark: <GaugeIcon />,
    tagKo: "BENCHMARK · GPU",
    tagEn: "BENCHMARK · GPU",
    ready: true,
  },
} satisfies Record<DevToolRoute, DevTool>;

interface DevSection {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subKo: string;
  readonly subEn: string;
  readonly routes: readonly DevToolRoute[];
}

const DEV_SECTIONS: readonly DevSection[] = [
  {
    id: "data",
    titleKo: "데이터 & 생산 에디터",
    titleEn: "Data & Production Editors",
    subKo:
      "시설·채집 티어 확률(N43), 아이템·총량 자원(P1~P4), 스킬·소모, 구인 카드를 담고(Draft) 검사 뒤 즉시 반영합니다.",
    subEn:
      "Stage, validate, and live-apply facilities, N43 gather tier probabilities, items (P1~P4 reserves), skills, and recruitment.",
    routes: [
      "dev_creatures",
      "dev_buildings",
      "dev_production",
      "dev_items",
      "dev_skills",
      "dev_effects",
      "dev_recruit",
    ],
  },
  {
    id: "balance",
    titleKo: "밸런싱 · 2차 스탯 & 전투 보고서",
    titleEn: "Balancing, Secondary Stats & Battle Reports",
    subKo:
      "2차 스탯 가중치·계산식, 실제 판정 N회 전투 보고서(공성·A/B·피해 흐름), 49 설정 칸(N53 스위치 포함), 6v6 3D 전투 다시보기를 다룹니다.",
    subEn:
      "Secondary stat weights and formulas, N-run battle reports from the real engine (siege, A/B, damage flow), 49 settings cells (including N53 switches), and 6v6 3D battle replays.",
    routes: [
      "dev_exp_table",
      "dev_secondary_stats",
      "dev_balance",
      "dev_npc_ai",
      "dev_tuning",
      "dev_battle_replay",
    ],
  },
  {
    id: "world",
    titleKo: "월드 · 행성 & 영토 에디터",
    titleEn: "World, Planet & Territory Editors",
    subKo:
      "S2 구체 행성 지형·기후, 항성계 공전·자전, 도시·비콘 영토 볼록 껍질, 2차맵 지형을 편집·검증합니다.",
    subEn:
      "Edit and inspect S2 planetary terrain/climate, star system orbits, territory convex hulls, and secondary map terrain.",
    routes: [
      "dev_planet_editor",
      "dev_star_system",
      "dev_nations",
      "dev_world_layout",
      "dev_territory",
      "dev_terrain_objects",
      "dev_gather_objects",
    ],
  },
  {
    id: "diag",
    titleKo: "그래픽 & 기기 성능 진단",
    titleEn: "Graphics & Device Diagnostics",
    subKo: "WebGL2·TSL 셰이더 경로별 프레임 시간과 기기 렌더링 성능을 측정합니다.",
    subEn: "Benchmark frame times and rendering performance across WebGL2 and TSL shader paths.",
    routes: ["dev_gpu_bench"],
  },
  {
    id: "access",
    titleKo: "운영 권한",
    titleEn: "Operator Access",
    subKo: "운영자 콘솔 권한을 계정마다 체크박스로 더 줍니다. 개발자만 엽니다.",
    subEn: "Grant extra operator-console permissions per account with checkboxes. Developers only.",
    routes: ["dev_ops_grants"],
  },
];

function DevToolRow({ route, ko }: { readonly route: DevToolRoute; readonly ko: boolean }) {
  const tool: DevTool = DEV_TOOLS[route];
  return (
    <li>
      <AppLink to={{ route }} className="dev-tool">
        <span className="dev-tool-mark">{tool.mark}</span>
        <span className="dev-tool-text">
          <span className="dev-tool-name">
            {tool.name()}
            <span className="dev-tool-tag">{ko ? tool.tagKo : tool.tagEn}</span>
            {tool.ready ? null : (
              <>
                {" "}
                <span className="dev-tool-badge">{m.dev_tool_soon()}</span>
              </>
            )}
          </span>
          <span className="dev-tool-desc">{tool.desc()}</span>
        </span>
        <span className="dev-tool-go">
          <ForwardIcon />
        </span>
      </AppLink>
    </li>
  );
}

export default function DevHome() {
  const ko = getLocale() !== "en";
  const session = useSession();
  const roles = session.kind === "signed_in" ? session.user.roles : [];
  return (
    <section className="screen dev-home" aria-labelledby="dev-home-title">
      <div className="screen-header">
        <h1 id="dev-home-title" className="screen-title" tabIndex={-1}>
          {m.shell_dev()}
        </h1>
        <BackButton />
      </div>

      {/* Part B 역할 배너 (개발 · 에디터 · 시뮬레이터 허브) */}
      <div className="dev-role-banner">
        <div className="dev-role-info">
          <div className="dev-role-head">
            <span className="dev-part-badge">PART B · EDITOR &amp; BALANCING HUB</span>
            <div className="dev-workflow-pills" aria-label={ko ? "편집 작업 흐름" : "Editing workflow"}>
              <span className="dev-workflow-pill">1. Draft {ko ? "담기" : "Stage"}</span>
              <span className="dev-workflow-arrow" aria-hidden="true">
                →
              </span>
              <span className="dev-workflow-pill">2. Preview {ko ? "시뮬·검사" : "Check"}</span>
              <span className="dev-workflow-arrow" aria-hidden="true">
                →
              </span>
              <span className="dev-workflow-pill">3. Apply {ko ? "즉시 반영" : "Live Apply"}</span>
            </div>
          </div>
          <p className="lead">{m.dev_home_lead()}</p>
        </div>
        <AppLink to={{ route: "admin" }} className="dev-hub-link">
          {ko ? "운영 & 라이브 관리 (/admin) 전환 →" : "Switch to Live Ops & Admin (/admin) →"}
        </AppLink>
      </div>

      <div className="dev-sections" aria-label={m.dev_home_tools()}>
        {DEV_SECTIONS.filter((section) => section.routes.some((route) => canOpenRoute(route, roles))).map(
          (section) => (
            <section key={section.id} className="dev-section">
              <div className="dev-section-head">
                <h2 className="dev-section-title">{ko ? section.titleKo : section.titleEn}</h2>
                <p className="dev-section-sub">{ko ? section.subKo : section.subEn}</p>
              </div>
              <ul className="dev-tools">
                {section.routes
                  .filter((route) => canOpenRoute(route, roles))
                  .map((route) => (
                    <DevToolRow key={route} route={route} ko={ko} />
                  ))}
              </ul>
            </section>
          ),
        )}
      </div>
      {/* 지금 도는 앱·서버 빌드(한국 시각, 분까지)·팩 판 — 설정 → 앱 정보와 같은 줄(사용자 요청 2026-11-15) */}
      <div className="dev-version">
        <VersionRow />
      </div>
    </section>
  );
}
