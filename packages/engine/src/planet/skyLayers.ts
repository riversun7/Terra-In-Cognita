// 1차맵 하늘 물체 만들기(three.js) — 엔진이 하늘 조절기(skyController.ts)에 넘기는 달·구름 만들기 함수.
// 첫 표시 뒤 처음 필요할 때 조절기가 부른다: 장면에 숨긴 채 넣고 새 물체의 셰이더만 미리 컴파일한다(처음 보일 때 멈칫하지 않게).
// 구름은 기후 큐브가 쓰는 첫 단계 타일을 늘 원한다(F ≤ 10: 6·24개. F11은 96개라 받은 것만 쓴다 — ADR 6절).
// planetEngine.ts를 600줄 경고 아래로 두려고 따로 둔다.
import type { WebGLRenderer } from "three";
import { firstLevelNodes } from "./cloudClimate.ts";
import { CloudLayer } from "./clouds.ts";
import type { GpuBench } from "./gpuBench.ts";
import { MoonLayer } from "./moon.ts";
import { skyLightUniformsOf } from "./planetMaterials.ts";
import { type PlanetTileGpu, type PlanetView, SPACE_COLOR, precompile } from "./planetView.ts";
import { type SkyControllerOptions, reportSkyError } from "./skyController.ts";
import type { TilePipeline } from "./tilePipeline.ts";
import { type TileLayout, tileKey } from "./tileTree.ts";

/** 첫 단계 타일을 늘 원하는 면 레벨 상한(F11은 첫 단계가 96개라 다 받지 않는다) */
const PIN_FIRST_LEVEL_MAX_FACE_LEVEL = 10;

export interface SkyLayerDeps {
  readonly renderer: WebGLRenderer;
  readonly view: PlanetView;
  readonly pipeline: TilePipeline<PlanetTileGpu>;
  readonly layout: TileLayout;
  readonly radiusM: number;
  /** 구름 시드(u32) */
  readonly seed: number;
  readonly requestFrame: () => void;
  /** [재기 모드] 구름 면 굽기를 GPU 끝까지 잰다 */
  readonly bench: GpuBench | null;
}

export function skyLayerFactories(
  deps: SkyLayerDeps,
): Pick<SkyControllerOptions, "createMoons" | "createClouds"> {
  const { renderer, view, pipeline, layout } = deps;
  const pinFirstLevel = layout.faceLevel <= PIN_FIRST_LEVEL_MAX_FACE_LEVEL;
  return {
    createMoons: (moons) => {
      const layer = new MoonLayer(view.shared, moons, SPACE_COLOR);
      view.scene.add(...layer.meshes);
      for (const mesh of layer.meshes) precompile(renderer, mesh, view.camera, view.scene);
      return layer;
    },
    createClouds: () => {
      if (pinFirstLevel) {
        pipeline.pin(firstLevelNodes(layout).map((node) => ({ key: tileKey(node), node, priority: 0 })));
      }
      const bench = deps.bench;
      const clouds = new CloudLayer({
        renderer,
        radiusM: deps.radiusM,
        layout,
        seed: deps.seed,
        // 하늘 빛 uniform만 넘긴다(껍질 재질에 타일 팔레트 등이 섞이지 않게)
        shared: skyLightUniformsOf(view.shared),
        pick: view.pickClear,
        decoded: (key) => pipeline.decoded(key),
        climateReady: () => !pinFirstLevel || pipeline.pinnedReady(),
        requestFrame: deps.requestFrame,
        report: reportSkyError,
        ...(bench ? { sync: () => bench.sync() } : {}),
      });
      view.scene.add(clouds.mesh);
      precompile(renderer, clouds.mesh, view.camera, view.scene);
      clouds.precompile((scene, camera) => precompile(renderer, scene, camera));
      return clouds;
    },
  };
}
