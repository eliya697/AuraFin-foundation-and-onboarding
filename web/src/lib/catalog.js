import { Baby, Briefcase, GraduationCap, Home, Laptop, LifeBuoy, Unlink } from 'lucide-react';
import catalog from '@shared/tracks.json';

const LIFE_STAGE_ICONS = { student: GraduationCap, employee: Briefcase, freelancer: Laptop, young_family: Baby };
const GOAL_ICONS = { house: Home, debt: Unlink, safety_net: LifeBuoy };

export const LIFE_STAGES = catalog.lifeStages.map((s) => ({ ...s, icon: LIFE_STAGE_ICONS[s.id] }));
export const GOALS = catalog.goals.map((g) => ({ ...g, icon: GOAL_ICONS[g.id] }));
export const TRACKS = Object.fromEntries(catalog.tracks.map((t) => [t.id, t]));
export const FIELDS = catalog.fields;
export const MAX_AMOUNT = catalog.maxAmount;

/**
 * Returns the recommended track for a profile plus up to two alternatives.
 * Debt always takes priority; otherwise the life stage decides, falling back to the goal.
 */
export function recommendTracks(lifeStage, goal) {
  const { byGoal, byLifeStage, goalTakesPriority } = catalog.recommendations;
  const goalTrack = byGoal[goal];
  const stageTrack = byLifeStage[lifeStage];
  const recommended = goalTakesPriority.includes(goal) ? goalTrack : stageTrack ?? goalTrack;

  const ordered = [recommended, goalTrack, stageTrack, 'safety_net_builder', 'first_home'];
  const ids = [...new Set(ordered.filter(Boolean))].slice(0, 3);
  return ids.map((id) => ({ ...TRACKS[id], recommended: id === recommended }));
}
