// 같은 나라 시야 공유 비용 측정(질문 746 나, docs/adr/2026-11-08-citizenship.md) — node bench/visionShare.ts [유닛 수] [보는 사람 수] [틱 수] [spread|city]
// 가짜 2차맵 하나(256 × 256 배치 칸)에 유닛을 두고(나라 넷의 NPC 휴먼 + 보는 사람마다 사이보그 하나, 모두 걸음), 보는 사람을 나라마다
// 고르게 구독시킨 뒤 시야 틱을 되풀이한다. spread = 2차맵 전체에 고르게(가장 나쁜 경우: 나라 덮개가 2차맵을 거의 다 덮는다), city = 나라마다
// 도시 하나(네 귀퉁이 쪽 시청 칸)의 둘레 32칸 안(NPC 휴먼 집 둘레 걷기, WP-NPC — 서버 휴먼과 같은 꼴), 보는 사람은 자기 나라 도시에 선다. 공유 끔(내 시야만)과 켬(같은 나라 덮개)을 같은 유닛·같은 시각으로 재서 틱 하나의 ms(평균·p95·최대),
// 틱마다 무리 덮개·나라 덮개 수, 보낸 메시지·바이트를 표로 낸다. pnpm test에는 없다(시간을 재는 스크립트라 기계마다 다르다).
// 서버 S1 시험 봇 1,000은 띄운 2차맵(시험 줄 6장 + 도시 2차맵)에 나뉘므로 2차맵 하나는 수십 명이다 — 1,000을 한 2차맵에 모은 것은 가장 나쁜 경우다.
import { performance } from "node:perf_hooks";
import { CELL_UNITS, PLACEMENT_SIZE, WALK_SPEED, createMotion } from "@terra/sim";
import { createRng } from "@terra/shared";
import { BATCH_INTERVAL_MS, emptyStreamStats } from "../src/world/mapStream.ts";
import { type NationLookup, VISION_TICK_MS, type VisionUnit, createMapVision } from "../src/world/vision.ts";
import { motionToWire, sized } from "../src/world/wire.ts";

const unitCount = Number(process.argv[2] ?? 1000);
const viewerCount = Number(process.argv[3] ?? 20);
const ticks = Number(process.argv[4] ?? 60);
const layout = process.argv[5] === "city" ? "city" : "spread";
/** city 꼴: 나라 n(1~4)의 시청 칸과 집 둘레 반지름(배치 칸) */
const HOME_RADIUS = 32;
const hallOf = (nation: number) => ({ x: nation % 2 === 0 ? 64 : 192, y: nation <= 2 ? 64 : 192 });
const NATIONS = 4;
/** NPC 국가 주체 ID = 1~4, 보는 사람(유저) 주체 = 101~ */
const viewerOwner = (index: number): number => 101 + index;

function percentile(sorted: readonly number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;
}

/** 유닛 ID → 나라(보는 사람 사이보그는 차례대로, NPC 휴먼은 ID로 나눈다) */
const nationOfUnit = (id: number): number =>
  id <= viewerCount ? 1 + ((id - 1) % NATIONS) : 1 + (id % NATIONS);

/** 틱마다 새 목적지를 고르는 유닛 몫(‰) — 서버 봇처럼 도착하고 쉬었다가 다시 걷는다 */
const REPATH_PM = 50;

/** 칸 하나에서 다른 칸으로 걷는 유닛(출발 시각을 흩는다). city 꼴이면 그 나라 시청 둘레 안에서만 */
function walker(
  id: number,
  ownerId: number,
  nation: number,
  rng: ReturnType<typeof createRng>,
  departAtMs?: number,
): VisionUnit {
  const hall = hallOf(nation);
  const axis = (centre: number) =>
    layout === "city"
      ? Math.min(PLACEMENT_SIZE - 1, Math.max(0, centre - HOME_RADIUS + rng.nextInt(2 * HOME_RADIUS + 1)))
      : rng.nextInt(PLACEMENT_SIZE);
  const point = () => ({
    x: axis(hall.x) * CELL_UNITS + CELL_UNITS / 2,
    y: axis(hall.y) * CELL_UNITS + CELL_UNITS / 2,
  });
  const motion = createMotion({
    waypoints: [point(), point()],
    departAtMs: departAtMs ?? rng.nextInt(60_000),
    speed: WALK_SPEED,
  });
  return { id, ownerId, size: 1, motion, entry: sized(motionToWire(id, 1, motion)) };
}

async function run(share: boolean) {
  const rng = createRng(20261108);
  let clock = 60_000;
  const units = new Map<number, VisionUnit>();
  // 보는 사람마다 사이보그 하나, 나머지는 NPC 휴먼(나라 넷에 고르게)
  for (let v = 0; v < viewerCount; v++)
    units.set(v + 1, walker(v + 1, viewerOwner(v), 1 + (v % NATIONS), rng));
  for (let id = viewerCount + 1; id <= unitCount; id++) {
    const nation = 1 + (id % NATIONS);
    units.set(id, walker(id, nation, nation, rng));
  }
  const nationOf = new Map<number, number>();
  for (let n = 1; n <= NATIONS; n++) nationOf.set(n, n);
  for (let v = 0; v < viewerCount; v++) nationOf.set(viewerOwner(v), 1 + (v % NATIONS));
  const lookup: NationLookup = (ownerId) => nationOf.get(ownerId);
  const stats = emptyStreamStats();
  const vision = createMapVision({
    mapKey: 1,
    terrain: { url: "/t", generatorVersion: 1 },
    now: () => clock,
    stats,
    source: { units: () => units.values(), unit: (id) => units.get(id), buildings: () => [] },
  });
  let messages = 0;
  let bytes = 0;
  for (let v = 0; v < viewerCount; v++)
    vision.subscribe(
      {
        send: (text) => {
          messages += 1;
          bytes += text.length;
        },
        bufferedAmount: () => 0,
      },
      { userId: `u${v}`, ownerId: viewerOwner(v), nations: share ? lookup : undefined },
    );
  const startMessages = messages;
  const startBytes = bytes;
  const samples: number[] = [];
  for (let t = 0; t < ticks; t++) {
    clock += VISION_TICK_MS;
    // 다시 걷는 유닛(경로가 바뀐다 → 2차맵이 시야에 알린다). 이 시간은 재지 않는다
    for (const unit of units.values()) {
      if (rng.nextInt(1000) >= REPATH_PM) continue;
      const next = walker(unit.id, unit.ownerId, nationOfUnit(unit.id), rng, clock);
      units.set(unit.id, next);
      vision.unitChanged(next);
    }
    const t0 = performance.now();
    vision.tick();
    samples.push(performance.now() - t0);
    // 전송 묶음이 나가게(묶음 간격) 한 번 쉰다 — 보낸 바이트를 다 센다
    await new Promise((resolve) => setTimeout(resolve, BATCH_INTERVAL_MS + 5));
  }
  vision.close();
  const sorted = samples.toSorted((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    share,
    avgMs: sum / ticks,
    p95Ms: percentile(sorted, 0.95),
    maxMs: sorted.at(-1) ?? 0,
    groupTicks: stats.visionGroupTicks / ticks,
    nationCovers: stats.visionNationCovers / ticks,
    messages: (messages - startMessages) / ticks,
    bytes: (bytes - startBytes) / ticks,
  };
}

// 덥히기(JIT) 한 번씩 버리고 잰다
await run(false);
await run(true);
const rows = [await run(false), await run(true)];
console.log(
  `유닛 ${unitCount} · 보는 사람 ${viewerCount}(나라 ${NATIONS}) · 시야 틱 ${ticks}번(2차맵 하나) · 배치 ${layout}`,
);
console.log("| 공유 | 틱 평균 ms | p95 ms | 최대 ms | 무리 덮개/틱 | 나라 덮개/틱 | 메시지/틱 | 바이트/틱 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const row of rows)
  console.log(
    `| ${row.share ? "켬" : "끔"} | ${row.avgMs.toFixed(2)} | ${row.p95Ms.toFixed(2)} | ${row.maxMs.toFixed(2)} | ${row.groupTicks.toFixed(0)} | ${row.nationCovers.toFixed(1)} | ${row.messages.toFixed(1)} | ${row.bytes.toFixed(0)} |`,
  );
