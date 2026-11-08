// Where the cracker stall stands in the aangan, and the floor it blocks. The numbers are pure so the layout can be tested
// under Node: the stall keeps clear of the walk path from the gate to the door, the tulsi chaura, the charpais and the lota.
/** Centre of the stall's counter on the courtyard floor, in metres: open ground west of the walk path. */
export const STALL_CENTRE = { x: -3.2, z: 4.0 };
/** Counter width along x, in metres. */
export const STALL_W = 1.9;
/** Counter depth along z, in metres. */
export const STALL_D = 0.9;
/** Half-width of the walk path from the gate to the door, in metres; no solid prop stands inside it. */
export const WALK_PATH_HALF = 1.2;

/** The floor rectangle the counter blocks, in world x and z, as the collision world takes it. */
export function stallFootprint(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: STALL_CENTRE.x - STALL_W / 2,
    maxX: STALL_CENTRE.x + STALL_W / 2,
    minZ: STALL_CENTRE.z - STALL_D / 2,
    maxZ: STALL_CENTRE.z + STALL_D / 2,
  };
}
