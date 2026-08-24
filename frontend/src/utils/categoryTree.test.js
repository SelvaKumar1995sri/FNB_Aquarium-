import { describe, expect, it } from "vitest";

import { buildIndentedOptions, getAncestors, getDepth } from "./categoryTree";

const FISH = { id: 1, name: "Fish", slug: "fish", parent: null };
const CICHLID = { id: 2, name: "Cichlid", slug: "cichlid", parent: 1 };
const FULL_MOON = { id: 3, name: "Full Moon", slug: "full-moon", parent: 2 };
const PLANTS = { id: 4, name: "Plants", slug: "plants", parent: null };
const CATEGORIES = [FISH, CICHLID, FULL_MOON, PLANTS];

describe("getAncestors", () => {
  it("returns an empty array for a top-level category", () => {
    expect(getAncestors(FISH, CATEGORIES)).toEqual([]);
  });

  it("returns root-first ancestors for a 3-level chain", () => {
    expect(getAncestors(FULL_MOON, CATEGORIES)).toEqual([FISH, CICHLID]);
  });

  it("returns an empty array for a null/undefined category", () => {
    expect(getAncestors(null, CATEGORIES)).toEqual([]);
  });

  it("does not hang on a cyclic parent chain", () => {
    const a = { id: 10, name: "A", parent: 11 };
    const b = { id: 11, name: "B", parent: 10 };
    const result = getAncestors(a, [a, b]);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("getDepth", () => {
  it("is 0 for a top-level category", () => {
    expect(getDepth(FISH, CATEGORIES)).toBe(0);
  });

  it("is 2 for a 3rd-level category", () => {
    expect(getDepth(FULL_MOON, CATEGORIES)).toBe(2);
  });
});

describe("buildIndentedOptions", () => {
  it("orders categories depth-first, parents immediately before their children", () => {
    const options = buildIndentedOptions(CATEGORIES);
    expect(options.map((option) => option.id)).toEqual([1, 2, 3, 4]);
  });

  it("indents child labels with full-width spaces proportional to depth", () => {
    const options = buildIndentedOptions(CATEGORIES);
    expect(options.find((option) => option.id === 1).label).toBe("Fish");
    expect(options.find((option) => option.id === 2).label).toBe("　Cichlid");
    expect(options.find((option) => option.id === 3).label).toBe("　　Full Moon");
  });

  it("excludes a given id and its whole subtree", () => {
    const options = buildIndentedOptions(CATEGORIES, { excludeIds: [1] });
    expect(options.map((option) => option.id)).toEqual([4]);
  });
});
