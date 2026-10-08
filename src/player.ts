// You: position and velocity in world units, moved with momentum.
import { RUN_MULTIPLIER, STOP_SPEED, VELOCITY_TIME_CONSTANT, WALK_SPEED } from './config.ts';

/** Position (x, y) and velocity (vx, vy) in world units; y grows southwards. */
export type Player = { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number };

/** Where the keys point (dx, dy each -1, 0 or 1) and whether you run. */
export type MoveIntent = { readonly dx: number; readonly dy: number; readonly run: boolean };

/** One physics step. `terrain` multiplies your speed; nothing ever blocks you. Pure. */
export function stepPlayer(p: Player, intent: MoveIntent, terrain: number, dt: number): Player {
  const length = Math.hypot(intent.dx, intent.dy);
  // Dividing by the key vector's length keeps diagonals as fast as straight lines.
  const speed = length > 0 ? (WALK_SPEED * terrain * (intent.run ? RUN_MULTIPLIER : 1)) / length : 0;
  const k = 1 - Math.exp(-dt / VELOCITY_TIME_CONSTANT);
  let vx = p.vx + (intent.dx * speed - p.vx) * k;
  let vy = p.vy + (intent.dy * speed - p.vy) * k;
  if (length === 0 && Math.hypot(vx, vy) < STOP_SPEED) {
    vx = 0;
    vy = 0;
  }
  return { x: p.x + vx * dt, y: p.y + vy * dt, vx, vy };
}
