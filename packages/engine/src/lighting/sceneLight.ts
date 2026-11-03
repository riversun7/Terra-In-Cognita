// 2차맵 장면 빛 — 빛 둘(반구 하나 + 방향 하나: 낮에는 항성, 밤에는 달)과 하늘(2차맵 밖) 색에 낮밤 빛(SecondMapSky)을 넣는다.
// 빛 수가 바뀌지 않아 셰이더를 다시 만들지 않는다. 세계 색은 화면 테마와 상관없다(D-070).
// 시계 모드면 1초마다 빛을 다시 계산하고, 눈에 띄게 바뀌었을 때만 다시 그리게 한다(숨긴 탭에서는 쉰다).
// secondMapEngine.ts가 쓴다(파일 크기를 나눈 것).
import { Color, DirectionalLight, HemisphereLight, type Scene } from "three";
import { lightStats } from "../engineParts.ts";
import type { EngineLightStats } from "../engineTypes.ts";
import type { PlanetSkyMode } from "../planet/sky.ts";
import { type SecondMapPlace, UNIT_NIGHT_LIFT, nightAmount } from "./secondMapLight.ts";
import { SKY_TICK_MS, SecondMapSky } from "./secondMapSky.ts";

/** 장면 빛이 엔진에 부탁하는 것 */
export interface SceneLightHooks {
  /** 유닛 밤 빛(0 ~ UNIT_NIGHT_LIFT)을 넣는다 */
  readonly setNightLift: (lift: number) => void;
  /** 빛이 눈에 띄게 바뀌었다 — 한 번 그린다 */
  readonly redraw: () => void;
}

export class SceneLight {
  private readonly sky: SecondMapSky;
  private readonly hooks: SceneLightHooks;
  private readonly background = new Color();
  private readonly hemisphere = new HemisphereLight();
  private readonly sun = new DirectionalLight();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(scene: Scene, place: SecondMapPlace | null, mode: PlanetSkyMode, hooks: SceneLightHooks) {
    this.hooks = hooks;
    scene.background = this.background;
    scene.add(this.hemisphere, this.sun);
    this.sky = new SecondMapSky(place, mode);
  }

  /** 처음 빛을 계산해 넣고, 시계 모드면 1초 타이머를 건다(엔진의 다시 그리기 예약이 준비된 뒤에 부른다) */
  start(nowMs: number): void {
    this.sky.tick(nowMs);
    this.apply();
    this.syncTimer();
  }

  /** 프레임마다: 빛을 옮기는 중이면 한 걸음 가고 넣는다. 옮기는 중이면 true(다음 프레임이 필요) */
  frame(nowMs: number): boolean {
    const blending = this.sky.frame(nowMs);
    this.apply();
    return blending;
  }

  /** 숨겼던 화면이 돌아왔다 — 그동안 바뀐 빛을 다시 계산한다(그리기는 엔진이 예약) */
  wake(nowMs: number): void {
    this.sky.tick(nowMs);
  }

  /** 하늘 모드를 바꾼다. 빛이 바뀌면 다시 그리고, 타이머를 모드에 맞춘다 */
  setMode(mode: PlanetSkyMode, nowMs: number): void {
    if (this.sky.setMode(mode, nowMs)) this.hooks.redraw();
    this.syncTimer();
  }

  stats(): EngineLightStats {
    return lightStats(this.sky);
  }

  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.hemisphere.dispose();
    this.sun.dispose();
  }

  // 빛을 three 빛·하늘 색·유닛 밤 빛에 넣는다(숫자 몇 개라 프레임마다 넣어도 싸다)
  private apply(): void {
    const light = this.sky.light;
    this.hemisphere.color.setRGB(...light.hemisphereSky);
    this.hemisphere.groundColor.setRGB(...light.hemisphereGround);
    this.hemisphere.intensity = light.hemisphereIntensity;
    this.sun.color.setRGB(...light.directColor);
    this.sun.intensity = light.directIntensity;
    this.sun.position.set(...light.direction);
    this.background.setRGB(...light.background);
    this.hooks.setNightLift(UNIT_NIGHT_LIFT * nightAmount(light));
  }

  private readonly tick = (): void => {
    if (document.visibilityState === "hidden") return;
    if (this.sky.tick(performance.now())) this.hooks.redraw();
  };

  private syncTimer(): void {
    if (this.sky.ticking && this.timer === null) this.timer = setInterval(this.tick, SKY_TICK_MS);
    if (!this.sky.ticking && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
