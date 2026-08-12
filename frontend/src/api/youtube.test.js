import { describe, expect, it } from "vitest";
import { extractYoutubeVideoId } from "./youtube";

describe("extractYoutubeVideoId", () => {
  it("parses a standard watch URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses a short youtu.be URL", () => {
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns empty string for an unrecognized URL", () => {
    expect(extractYoutubeVideoId("https://example.com")).toBe("");
  });
});
