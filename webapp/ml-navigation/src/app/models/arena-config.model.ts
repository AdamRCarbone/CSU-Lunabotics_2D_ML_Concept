/** Arena layout definitions matching training_nav/config.yaml exactly. */

export interface ZoneRect {
  x: number;   // metres from arena left edge
  y: number;   // metres from arena bottom edge
  w: number;
  h: number;
}

export interface ArenaLayout {
  name: string;
  label: string;
  width: number;      // metres
  length: number;     // metres
  excavation: ZoneRect;
  start:      ZoneRect;
  deposit:    ZoneRect;
  berm:       ZoneRect;
  column:     ZoneRect | null;  // null = no column (UCF)
  arenaTypeVal: number;  // 0.0 = UCF, 1.0 = KSC  (matches model input)
}

// ── KSC Artemis 2026 ──────────────────────────────────────────────────────────
// left-column excavation, bottom-right deposit, bottom-left start
const KSC_W  = 6.88;
const KSC_L  = 5.00;
const KSC_EX = KSC_W * 0.363;  // 2.50 m — excavation column width
const KSC_SH = KSC_L * 0.400;  // 2.00 m — start zone height (bottom of excavation)
const KSC_DH = KSC_L * 0.300;  // 1.50 m — deposit zone height (bottom-right)

export const KSC_ARENA: ArenaLayout = {
  name:  'ksc',
  label: 'KSC',
  width:  KSC_W,
  length: KSC_L,
  excavation: { x: 0,      y: 0,      w: KSC_EX,          h: KSC_L  },
  start:      { x: 0,      y: 0,      w: KSC_EX,          h: KSC_SH },
  deposit:    { x: KSC_EX, y: 0,      w: KSC_W - KSC_EX,  h: KSC_DH },
  berm:       { x: KSC_EX + (KSC_W - KSC_EX) / 2 - 0.85,
                y: KSC_DH / 8,
                w: 1.7, h: 0.8 },
  column:     { x: KSC_EX - 0.2, y: KSC_L / 2 - 0.2, w: 0.4, h: 0.4 },
  arenaTypeVal: 1.0,
};

// ── UCF Practice Arena 2026 ───────────────────────────────────────────────────
// upper-left excavation, bottom-left deposit/construction, top-right start
const UCF_W  = 8.10;
const UCF_L  = 4.57;
const UCF_CW = UCF_W * 0.321;  // 2.60 m — construction width (bottom-left)
const UCF_CH = UCF_L * 0.438;  // 2.00 m — construction height
const UCF_EW = UCF_W * 0.494;  // 4.00 m — excavation width (upper-left)
const UCF_SW = UCF_W * 0.247;  // 2.00 m — start zone width (upper-right)
const UCF_SH = UCF_L * 0.438;  // 2.00 m — start zone height (from top)

export const UCF_ARENA: ArenaLayout = {
  name:  'ucf',
  label: 'UCF',
  width:  UCF_W,
  length: UCF_L,
  excavation: { x: 0,             y: UCF_L - UCF_SH, w: UCF_EW,          h: UCF_SH },
  start:      { x: UCF_W - UCF_SW, y: UCF_L - UCF_SH, w: UCF_SW,          h: UCF_SH },
  deposit:    { x: 0,             y: 0,              w: UCF_CW,          h: UCF_CH },
  berm:       { x: UCF_CW / 2 - 0.75,
                y: UCF_CH / 2 - 0.45,
                w: 1.5, h: 0.9 },
  column: null,
  arenaTypeVal: 0.0,
};

export const ARENAS: Record<string, ArenaLayout> = { ksc: KSC_ARENA, ucf: UCF_ARENA };
