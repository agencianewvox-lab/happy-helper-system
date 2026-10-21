import { describe, it, expect } from "vitest";
import {
  chunkMeta,
  completeChunks,
  deviceToken,
  isWebm,
  MAX_AUDIO_BYTES,
  meetCode,
  safeTitle,
  uuid,
} from "../../supabase/functions/_shared/meeting-model";
describe("meeting input boundaries", () => {
  const id = "c0a67bd7-cd1d-4196-b6f0-21f8b54cf67a";
  it("accepts only canonical Meet rooms", () => {
    expect(meetCode("https://meet.google.com/abc-defg-hij")).toBe(
      "abc-defg-hij",
    );
    for (const value of [
      "https://evil.com/abc-defg-hij",
      "https://meet.google.com.evil.com/abc-defg-hij",
      "abc-defg-hij?token=1",
      "data:abc-defg-hij",
      null,
    ])
      expect(() => meetCode(value)).toThrow();
  });
  it("validates scoped device credentials", () => {
    expect(deviceToken(`nvm.${id}.${"a".repeat(64)}`).deviceId).toBe(id);
    for (const value of [
      id,
      "Bearer " + id,
      `nvm.${id}.${"a".repeat(63)}`,
      `nvm.${id}.${"z".repeat(64)}`,
    ])
      expect(() => deviceToken(value)).toThrow();
  });
  it("does not coerce missing chunk values into zero", () => {
    for (const value of [null, undefined, "", true, -1, 240, 1.5])
      expect(() =>
        chunkMeta({ seq: value, durationMs: 60000, offsetMs: 0 }),
      ).toThrow();
    expect(chunkMeta({ seq: "0", durationMs: "60000", offsetMs: "0" })).toEqual(
      { seq: 0, durationMs: 60000, offsetMs: 0 },
    );
  });
  it("bounds independently playable audio chunks", () => {
    const bytes = new Uint8Array(100);
    bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
    expect(isWebm(bytes)).toBe(true);
    expect(isWebm(bytes.slice(0, 32))).toBe(false);
    bytes[0] = 0;
    expect(isWebm(bytes)).toBe(false);
    const large = new Uint8Array(MAX_AUDIO_BYTES + 1);
    large.set([0x1a, 0x45, 0xdf, 0xa3]);
    expect(isWebm(large)).toBe(false);
  });
  it("never treats incomplete, duplicated or pending chunks as complete", () => {
    expect(
      completeChunks(
        [
          { seq: 1, status: "done" },
          { seq: 0, status: "done" },
        ],
        2,
      ),
    ).toBe(true);
    for (const parts of [
      [{ seq: 1, status: "done" }],
      [
        { seq: 0, status: "done" },
        { seq: 0, status: "done" },
      ],
      [
        { seq: 0, status: "done" },
        { seq: 1, status: "pending" },
      ],
    ])
      expect(completeChunks(parts, 2)).toBe(false);
    expect(completeChunks([], 0)).toBe(false);
    expect(completeChunks([], null)).toBe(false);
  });
  it("bounds names and IDs", () => {
    expect(uuid(id)).toBe(id);
    expect(() => uuid("anything")).toThrow();
    expect(safeTitle("  Alinhamento  ")).toBe("Alinhamento");
    expect(() => safeTitle(" ")).toThrow();
    expect(() => safeTitle("x".repeat(161))).toThrow();
  });
});
