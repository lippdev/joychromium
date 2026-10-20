import type { TrackingLevel } from "./settings";

/**
 * Which lists each tracking-prevention level feeds the Ghostery engine (E8-03). The URLs are the ones
 * `@ghostery/adblocker` downloads for its own presets, so nothing new is introduced here:
 * `ads` is the package's ads preset, `tracking` adds EasyPrivacy and uBlock's privacy list, and `social`
 * adds Fanboy's Annoyance list, which is what removes social widgets (Pinterest's pinit.js, Google's
 * platform.js) that the tracking lists leave alone. Each group is a superset of the one before it.
 */

const ASSETS = "https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets";

export const TRACKER_LISTS = {
  ads: [
    `${ASSETS}/easylist/easylist.txt`,
    `${ASSETS}/peter-lowe/serverlist.txt`,
    `${ASSETS}/ublock-origin/badware.txt`,
    `${ASSETS}/ublock-origin/filters-2020.txt`,
    `${ASSETS}/ublock-origin/filters-2021.txt`,
    `${ASSETS}/ublock-origin/filters-2022.txt`,
    `${ASSETS}/ublock-origin/filters-2023.txt`,
    `${ASSETS}/ublock-origin/filters-2024.txt`,
    `${ASSETS}/ublock-origin/filters.txt`,
    `${ASSETS}/ublock-origin/quick-fixes.txt`,
    `${ASSETS}/ublock-origin/resource-abuse.txt`,
    `${ASSETS}/ublock-origin/unbreak.txt`,
  ],
  tracking: [
    `${ASSETS}/easylist/easyprivacy.txt`,
    `${ASSETS}/ublock-origin/privacy.txt`,
  ],
  social: [
    `${ASSETS}/fanboy/annoyance.txt`,
  ],
} as const satisfies Record<string, readonly string[]>;

export type TrackerListGroup = keyof typeof TRACKER_LISTS;

const GROUPS_BY_LEVEL: Record<TrackingLevel, readonly TrackerListGroup[]> = {
  Basic: ["ads"],
  Balanced: ["ads", "tracking"],
  Strict: ["ads", "tracking", "social"],
};

/** The list groups a level blocks, from the narrowest to the widest. */
export function trackerGroupsFor(level: TrackingLevel): readonly TrackerListGroup[] {
  return GROUPS_BY_LEVEL[level];
}

/** Every list URL a level blocks, in the order the engine parses them. */
export function trackerListsFor(level: TrackingLevel): string[] {
  return GROUPS_BY_LEVEL[level].flatMap((group) => TRACKER_LISTS[group]);
}
