import type { Visit } from '../creature/visit.ts';

const ease = (x: number): number => { const k = Math.max(0, Math.min(1, x)); return k * k * (3 - 2 * k); };

/**
 * One choreography for both worlds: approach, pass through, arrive; reverse on departure. The dreaming's own portal
 * (`seam`) opens and closes in the dream's phases; the road's (`gate`) stands open only in the travelling phases, for
 * the wisp to come out of and go back into, and shuts behind it before the dreaming returns.
 */
export function wispCrossing(v: Visit | null): { dream: number; spirit: number; approach: number; camp: number; shown: number; seam: number; gate: number } {
  if (v === null) return { dream: 1, spirit: 1, approach: 0, camp: 0, shown: 0, seam: 0, gate: 0 };
  const k = Math.max(0, Math.min(1, v.k));
  switch (v.phase) {
    case 'opening': return { dream: 1, spirit: 1 - ease((k - 0.75) / 0.25), approach: ease(k), camp: 0, shown: 0, seam: ease(k / 0.4), gate: 0 };
    case 'coming': return { dream: 1 - ease(k / 0.25), spirit: 0, approach: 1, camp: ease((k - 0.3) / 0.7), shown: ease((k - 0.22) / 0.13), seam: 1 - ease(k / 0.25), gate: ease(k / 0.2) * (1 - ease((k - 0.45) / 0.25)) };
    case 'with': return { dream: 0, spirit: 0, approach: 1, camp: 1, shown: 1, seam: 0, gate: 0 };
    case 'going': return { dream: 0, spirit: 0, approach: 1, camp: 1 - ease((k - 0.05) / 0.6), shown: 1 - ease((k - 0.6) / 0.18), seam: ease((k - 0.6) / 0.4), gate: ease(k / 0.2) * (1 - ease((k - 0.78) / 0.22)) };
    case 'closing': return { dream: ease(k / 0.3), spirit: ease((k - 0.3) / 0.2), approach: 1 - ease((k - 0.5) / 0.5), camp: 0, shown: 0, seam: 1 - ease((k - 0.5) / 0.5), gate: 0 };
  }
}

/** One brief greeting on waking nights; a quiet watch while he sleeps. */
export function wispBond(v: Visit | null): { hand: number; watch: number; dim: number } {
  if (v?.phase !== 'with') return { hand: 0, watch: 0, dim: 1 };
  const awake = v.woke && v.k > 0.12 && v.k < 0.88;
  const hand = awake ? ease((v.k - 0.28) / 0.035) * (1 - ease((v.k - 0.35) / 0.035)) : 0;
  const sleeping = v.woke ? ease((0.12 - v.k) / 0.03) + ease((v.k - 0.88) / 0.03) : 1;
  const watch = sleeping * ease(v.k / 0.1) * (1 - ease((v.k - 0.9) / 0.1));
  return { hand, watch, dim: 1 - watch * 0.45 };
}
