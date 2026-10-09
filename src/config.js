// Shared constants and gameplay tuning. All distances are in meters.

export const WALL_HEIGHT = 3;
export const WALL_THICKNESS = 0.2;
export const EYE_HEIGHT = 1.65;
export const PLAYER_RADIUS = 0.3;

// Room zones (axis-aligned, XZ plane). Used for building the house,
// for "which room am I in" checks, and for fear light levels.
export const ROOMS = {
  foyer: { label: 'Foyer', minX: -3, maxX: 3, minZ: 1.5, maxZ: 7.5 },
  hallway: { label: 'Hallway', minX: -6, maxX: 6, minZ: -1.5, maxZ: 1.5 },
  library: { label: 'Library', minX: -6, maxX: 0, minZ: -7.5, maxZ: -1.5 },
  study: { label: 'Study', minX: 0, maxX: 5, minZ: -6.5, maxZ: -1.5 },
};

export const PLAYER_START = { x: 0, z: 5.9, yaw: Math.PI };

export const TUNING = {
  walkSpeed: 2.1,
  interactRange: 2.4,

  fear: {
    start: 10,
    // per second, by room light level and flashlight state
    dark: 3.0,
    darkWithFlashlight: 0.8,
    dim: 1.2,
    dimWithFlashlight: 0.4,
    lit: -2.0,
    breathing: -6.0,
    breathWindup: 1.0,
    radio: -1.0,
    portraitStare: 2.0,
    // one-off events
    lockedDoor: 5,
    musicBox: 15,
    fakeItem: 15,
    familyPhoto: -10,
  },

  battery: {
    start: 100,
    drain: 0.6,
    pickup: 40,
    low: 20,
  },

  events: {
    minGap: 20,
    maxGap: 40,
  },
};

// Fear tiers (design doc §5.2)
export const TIERS = [
  { name: 'Calm', min: 0 },
  { name: 'Uneasy', min: 25 },
  { name: 'Disturbed', min: 50 },
  { name: 'Panic', min: 75 },
];

export function tierOf(fear) {
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) if (fear >= TIERS[i].min) tier = i;
  return tier;
}

export function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) {
    if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return id;
  }
  return null;
}
