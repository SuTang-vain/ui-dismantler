import type { RelationshipType } from "./types.js";

export const RELATIONSHIPS: Record<RelationshipType, { name: string; color: string }> = {
  family: { name: "宗亲", color: "var(--rel-family)" },
  ruler: { name: "君臣", color: "var(--rel-ruler)" },
  ally: { name: "同僚", color: "var(--rel-ally)" },
  enemy: { name: "对立", color: "var(--rel-enemy)" },
};

export const ASSET_BASE = "../assets/";
