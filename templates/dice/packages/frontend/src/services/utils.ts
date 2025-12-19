export type Characters = typeof characters[number];
export const characters = ["null"] as const;

export const characterToNumberMap: Record<Characters, number> = {
  null: 0,
};
