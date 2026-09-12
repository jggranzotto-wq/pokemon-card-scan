import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectGrade, photoLooksLikeSlab } from "./grades";

describe("detectGrade", () => {
  it("reads PSA from a title", () => {
    assert.deepEqual(detectGrade("Charizard Base PSA 9 Holo"), {
      grade: "PSA 9",
      isGraded: true,
    });
  });

  it("treats ungraded text as raw", () => {
    assert.deepEqual(detectGrade("Charizard Base raw NM"), {
      grade: "Raw",
      isGraded: false,
    });
  });
});

describe("photoLooksLikeSlab", () => {
  it("flags a PSA cert photo", () => {
    assert.equal(photoLooksLikeSlab("PSA 10 CERT 12345678"), true);
  });
});
