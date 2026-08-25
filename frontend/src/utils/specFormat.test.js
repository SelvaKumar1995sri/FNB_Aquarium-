import { describe, expect, it } from "vitest";

import { specificationToHtml } from "./specFormat";

describe("specificationToHtml", () => {
  it("returns an empty string for empty content", () => {
    expect(specificationToHtml("")).toBe("");
    expect(specificationToHtml(null)).toBe("");
  });

  it("wraps a plain line in a paragraph", () => {
    expect(specificationToHtml("Hello world")).toBe("<p>Hello world</p>");
  });

  it("converts **bold** to <strong>", () => {
    expect(specificationToHtml("**Tetra Bits** is great.")).toBe("<p><strong>Tetra Bits</strong> is great.</p>");
  });

  it("converts a run of bullet lines into a single <ul>", () => {
    expect(specificationToHtml("- One\n- Two")).toBe("<ul><li>One</li><li>Two</li></ul>");
  });

  it("supports bold text inside bullets", () => {
    expect(specificationToHtml("- **Bold** bullet")).toBe("<ul><li><strong>Bold</strong> bullet</li></ul>");
  });

  it("mixes paragraphs and bullet lists", () => {
    const result = specificationToHtml("Intro line\n- One\n- Two\nOutro line");
    expect(result).toBe("<p>Intro line</p><ul><li>One</li><li>Two</li></ul><p>Outro line</p>");
  });

  it("escapes HTML so admin-authored content cannot inject markup", () => {
    const result = specificationToHtml("<script>alert(1)</script>");
    expect(result).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("skips blank lines between paragraphs", () => {
    expect(specificationToHtml("One\n\nTwo")).toBe("<p>One</p><p>Two</p>");
  });
});
