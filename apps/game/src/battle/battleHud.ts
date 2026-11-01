// 다시보기 HTML 덧층 — 유닛 머리 위 이름·체력·아머·쉴드 막대와 떠오르는 숫자. docs/adr/2026-11-01-battle-replay.md 7절.
// 엔진 덧그림 층의 after(보기)에서 프레임마다 부른다: 화면 좌표(view.project)로 transform만 바꾼다(요소 수십 개, 레이아웃을 건드리지 않는다).
// 바뀐 값만 쓴다. 색·크기는 CSS(battleReplay.css, 토큰)다: 여기서는 data-* 와 transform·opacity·글자만 바꾼다.
// 막대·숫자는 화면 읽기 프로그램에 읽히지 않는다(aria-hidden): 같은 내용은 사건 기록 판·유닛 판에 글자로 있다.
import type { BattleReplay } from "@terra/protocol/battleReplay";
import { m } from "../paraglide/messages.js";
import { unitLabel } from "./battleText.ts";
import type { FloatingNumber, UnitFrame } from "./replayTimeline.ts";

/** 막대·이름을 띄우는 높이(m, 유닛 키 2.4 위) */
const TAG_LIFT_M = 3.1;
/** 숫자가 떠오르는 높이(m): 시작 + 수명 동안 */
const NUMBER_LIFT_M = 2.4;
const NUMBER_RISE_M = 4.5;
/** 이름은 가까이 볼 때만(목표점에서 1m가 이 CSS 픽셀 이상) 또는 고른 유닛만: 멀리서 붙어 싸우면 이름이 겹친다 */
const NAMES_PX_PER_M = 9;
/** 숫자 묶음(한 화면에 동시에) */
const NUMBER_POOL = 48;

export type Project = (cellX: number, cellY: number, liftM: number) => { x: number; y: number } | null;

interface Tag {
  readonly root: HTMLElement;
  readonly hp: HTMLElement;
  readonly armor: HTMLElement | null;
  readonly shield: HTMLElement | null;
  last: { transform: string; hp: number; armor: number; shield: number; status: string; hidden: boolean };
}

interface NumberSlot {
  readonly root: HTMLElement;
  key: number;
  transform: string;
}

function span(className: string, parent: HTMLElement): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  parent.append(element);
  return element;
}

function bar(className: string, parent: HTMLElement): HTMLElement {
  const track = span(`br-bar ${className}`, parent);
  return span("br-fill", track);
}

export class BattleHud {
  readonly root: HTMLElement;
  private readonly tags: Tag[];
  private readonly numbers: NumberSlot[] = [];
  private selected = -1;

  constructor(host: HTMLElement, replay: BattleReplay, team: (side: number) => number) {
    this.root = document.createElement("div");
    this.root.className = "br-hud";
    this.root.setAttribute("aria-hidden", "true");
    host.append(this.root);
    this.tags = replay.units.map((unit, index) => {
      const root = span("br-tag", this.root);
      root.dataset.team = String(team(unit.side));
      span("br-tag-name", root).textContent = unitLabel(replay, index);
      const bars = span("br-tag-bars", root);
      const hp = bar("br-bar-hp", bars);
      const armor = unit.armorHp > 0 ? bar("br-bar-armor", bars) : null;
      const shield = unit.shieldHp > 0 ? bar("br-bar-shield", bars) : null;
      return {
        root,
        hp,
        armor,
        shield,
        last: { transform: "", hp: -1, armor: -1, shield: -1, status: "", hidden: false },
      };
    });
    for (let i = 0; i < NUMBER_POOL; i++) {
      const root = span("br-num", this.root);
      root.hidden = true;
      this.numbers.push({ root, key: -1, transform: "" });
    }
  }

  select(index: number): void {
    if (this.selected === index) return;
    const before = this.tags[this.selected];
    if (before) delete before.root.dataset.selected;
    this.selected = index;
    const now = this.tags[index];
    if (now) now.root.dataset.selected = "true";
  }

  /** 프레임마다: 유닛 모습·숫자, 원점(2차맵 배치 칸), 감출 유닛 */
  update(
    replay: BattleReplay,
    frames: readonly UnitFrame[],
    numbers: readonly FloatingNumber[],
    origin: { readonly x: number; readonly y: number },
    hidden: (index: number) => boolean,
    project: Project,
    pixelsPerMetre: number,
  ): void {
    const names = pixelsPerMetre >= NAMES_PX_PER_M ? "on" : "off";
    if (this.root.dataset.names !== names) this.root.dataset.names = names;
    frames.forEach((frame, index) => {
      const tag = this.tags[index];
      const unit = replay.units[index];
      if (!tag || !unit) return;
      const hide = hidden(index) || frame.status === "absent" || frame.status === "retreated";
      const point = hide ? null : project(origin.x + frame.x, origin.y + frame.y, TAG_LIFT_M);
      const gone = point === null;
      if (gone !== tag.last.hidden) {
        tag.root.hidden = gone;
        tag.last.hidden = gone;
      }
      if (!point) return;
      const transform = `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0)`;
      if (transform !== tag.last.transform) {
        tag.root.style.transform = transform;
        tag.last.transform = transform;
      }
      if (frame.status !== tag.last.status) {
        tag.root.dataset.status = frame.status;
        tag.last.status = frame.status;
      }
      const fill = (
        element: HTMLElement | null,
        value: number,
        max: number,
        key: "hp" | "armor" | "shield",
      ) => {
        if (!element || tag.last[key] === value) return;
        tag.last[key] = value;
        element.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, value / max)) : 0})`;
      };
      fill(tag.hp, frame.hp, unit.maxHp, "hp");
      fill(tag.armor, frame.armor, unit.armorHp, "armor");
      fill(tag.shield, frame.shield, unit.shieldHp, "shield");
    });

    let used = 0;
    for (const number of numbers) {
      if (used >= this.numbers.length) break;
      if (hidden(number.unit)) continue;
      const point = project(
        origin.x + number.x,
        origin.y + number.y,
        NUMBER_LIFT_M + NUMBER_RISE_M * number.age,
      );
      if (!point) continue;
      const slot = this.numbers[used];
      if (!slot) break;
      used += 1;
      if (slot.key !== number.key) {
        slot.key = number.key;
        slot.root.dataset.kind = number.kind;
        slot.root.dataset.crit = number.crit ? "true" : "false";
        slot.root.textContent = numberText(number);
        slot.root.hidden = false;
      }
      // 속성 몫은 물리 몫 옆에(같은 사건의 둘째 숫자). 같은 유닛에 잇달아 뜬 숫자는 사건마다 조금씩 옆으로 비킨다
      const jitter = ((Math.floor(number.key / 2) * 7) % 5) - 2;
      const shift = (number.key % 2 === 1 ? 1 : 0) + jitter * 0.6;
      const transform = `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0) translateX(${Math.round(shift * 100)}%)`;
      if (transform !== slot.transform) {
        slot.root.style.transform = transform;
        slot.transform = transform;
      }
      slot.root.style.opacity = String(Math.round((1 - number.age * number.age) * 100) / 100);
    }
    for (let i = used; i < this.numbers.length; i++) {
      const slot = this.numbers[i];
      if (slot && slot.key !== -1) {
        slot.key = -1;
        slot.root.hidden = true;
      }
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

function numberText(number: FloatingNumber): string {
  switch (number.kind) {
    case "miss":
      return m.battle_miss();
    case "evade":
      return m.battle_evade();
    case "heal":
    case "shield":
      return `+${number.value}`;
    case "crit":
      return `${number.value}!`;
    default:
      return String(number.value);
  }
}
