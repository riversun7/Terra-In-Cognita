// 개발자 홈(/dev) — 개발자 도구 목록(ADR 2026-10-29-planet-editor-stage1 1절 "개발자 도구 한곳").
// - dev·admin만 연다(주소 표 access. 다른 역할은 틀이 권한 없음 화면을 그린다). 화면에서 가리는 것은 편의이고,
//   서버 자료를 쓰는 도구는 서버가 요청마다 권한을 본다.
// - 도구마다 한 줄: 아이콘, 이름(주소 표의 화면 이름과 같은 키), 한 줄 설명. 누르면 그 도구 화면을 쌓는다(부모 dev, ADR 37 2절).
// - 도구 목록은 주소 표에서 부모가 dev인 줄과 같다. 줄이 늘면 DEV_TOOLS에서 타입 오류가 난다(나중 도구도 한 줄씩 더한다).
// - 이 조각은 미리 캐시된다(작은 목록이다). 도구 조각은 이름 앞머리(gpuBench·planetEditor·starSystem·secondMapLab·tuningPanel·balancePanel·
//   skillEditor·itemEditor·buildingEditor·territoryLab·contentEditor·battleReplayLab)로
//   미리 캐시에서 빠진다.
import { ROUTES, type RouteId } from "@terra/shared";
import type { ReactNode } from "react";
import { m } from "../paraglide/messages.js";
import { AppLink } from "../shell/AppLink.tsx";
import { BackButton } from "../shell/BackButton.tsx";
import { Icon } from "../ui/icons.tsx";
import {
  CrateIcon,
  ForwardIcon,
  GaugeIcon,
  HouseIcon,
  OrbitIcon,
  ScaleIcon,
  SlidersIcon,
  SparkIcon,
  TerritoryIcon,
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
  /** false: 화면이 아직 준비 중 화면이다(줄에 "준비 중"을 붙인다). 그 도구 화면을 붙이면 true로 바꾼다 */
  readonly ready: boolean;
}

/** 도구마다 이름·설명·아이콘. 보이는 차례는 주소 표 차례다(TOOL_ROUTES) */
const DEV_TOOLS = {
  // 행성 편집기 화면(ADR 38 WP-D)
  dev_planet_editor: {
    name: m.shell_route_dev_planet_editor,
    desc: m.dev_tool_planet_editor_desc,
    mark: <Icon name="globe" />,
    ready: true,
  },
  // 항성계 편집기(ADR 2026-10-31-star-system-editor)
  dev_star_system: {
    name: m.shell_route_dev_star_system,
    desc: m.dev_tool_star_system_desc,
    mark: <OrbitIcon />,
    ready: true,
  },
  // 2차맵 시험(ADR 46 "구현하며 정한 것 (개발자 2차맵 시험)"): 시각·자리·고저 과장을 바꿔 보는 보기 전용 화면
  dev_second_map: {
    name: m.shell_route_dev_second_map,
    desc: m.dev_tool_second_map_desc,
    mark: <Icon name="map" />,
    ready: true,
  },
  // 설정 칸 패널(docs/adr/2026-11-01-dev-settings-panel.md): 49 설정 칸을 보고 그 세계에서 바로 바꾼다
  dev_tuning: {
    name: m.shell_route_dev_tuning,
    desc: m.dev_tool_tuning_desc,
    mark: <SlidersIcon />,
    ready: true,
  },
  // 밸런스·전투 실험실(docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)"): 팀 A·B 파티 전투 + 가중치 표
  dev_balance: {
    name: m.shell_route_dev_balance,
    desc: m.dev_tool_balance_desc,
    mark: <ScaleIcon />,
    ready: true,
  },
  // 스킬 편집기·행동별 소모(docs/adr/2026-11-01-skill-editor.md): 스킬마다 모든 칸·특수 효과, 행동별 스태미나·MP
  dev_skills: {
    name: m.shell_route_dev_skills,
    desc: m.dev_tool_skills_desc,
    mark: <SparkIcon />,
    ready: true,
  },
  // 아이템 편집기(docs/adr/2026-11-01-item-editor.md): 아이템마다 모든 칸·분류 자료, 서버가 셈하는 미리 보기, 담기 → 적용
  dev_items: {
    name: m.shell_route_dev_items,
    desc: m.dev_tool_items_desc,
    mark: <CrateIcon />,
    ready: true,
  },
  // 건물 편집기(docs/adr/2026-11-02-building-editor.md): 시설마다 레벨 구간별 건설 재료·자리·채집 칸, 담기 → 적용
  dev_buildings: {
    name: m.shell_route_dev_buildings,
    desc: m.dev_tool_buildings_desc,
    mark: <HouseIcon />,
    ready: true,
  },
  // 영토 층(docs/adr/2026-11-03-territory-layer.md): 도시·비콘 볼록 껍질, 겹침 규칙, 1차맵 칸 표, 시험 세력 비콘 놓기
  dev_territory: {
    name: m.shell_route_dev_territory,
    desc: m.dev_tool_territory_desc,
    mark: <TerritoryIcon />,
    ready: true,
  },
  // 전투 다시보기(docs/adr/2026-11-01-battle-replay.md): 시범 6 대 6을 서버에서 기록해 3D 지도에서 되감고 배속으로 본다
  dev_battle_replay: {
    name: m.shell_route_dev_battle_replay,
    desc: m.dev_tool_battle_replay_desc,
    mark: <ForwardIcon />,
    ready: true,
  },
  dev_gpu_bench: {
    name: m.shell_route_dev_gpu_bench,
    desc: m.dev_tool_gpu_bench_desc,
    mark: <GaugeIcon />,
    ready: true,
  },
} satisfies Record<DevToolRoute, DevTool>;

const TOOL_ROUTES = Object.keys(ROUTES).filter((id): id is DevToolRoute => Object.hasOwn(DEV_TOOLS, id));

function DevToolRow({ route }: { route: DevToolRoute }) {
  const tool: DevTool = DEV_TOOLS[route];
  return (
    <li>
      <AppLink to={{ route }} className="dev-tool">
        <span className="dev-tool-mark">{tool.mark}</span>
        <span className="dev-tool-text">
          <span className="dev-tool-name">
            {tool.name()}
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
  return (
    <section className="screen" aria-labelledby="dev-home-title">
      <div className="screen-header">
        <h1 id="dev-home-title" className="screen-title" tabIndex={-1}>
          {m.shell_dev()}
        </h1>
        <BackButton />
      </div>
      <p className="lead">{m.dev_home_lead()}</p>
      <ul className="dev-tools" aria-label={m.dev_home_tools()}>
        {TOOL_ROUTES.map((route) => (
          <DevToolRow key={route} route={route} />
        ))}
      </ul>
    </section>
  );
}
