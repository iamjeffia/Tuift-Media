/**
 * Said in the phases that write or change the interface (Build, Repair, Change). A Design chat
 * loads the Design skill pack at its start; these phases may use it. The phases that must answer
 * strict JSON (Brief, Brand, Page, Assets, Preview, Review) keep telling the model not to invoke
 * skills, so a skill's own output format never replaces the phase's answer.
 */
export const DESIGN_PACK_NOTE =
  "This chat's Design skill pack is available: use the skill that fits the work (interface and layout craft, typography, color, motion, accessibility) when it helps you write better code. A skill's advice never overrides the approved artifacts, the reference geometry or the JSON answer format below, and its own report format is not your final answer."
