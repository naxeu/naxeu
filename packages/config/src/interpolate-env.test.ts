import { afterEach, describe, expect, it } from "vitest";
import { interpolateEnv } from "./interpolate-env.js";

describe("interpolateEnv", () => {
  afterEach(() => {
    delete process.env.NAXEU_TEST_A;
    delete process.env.NAXEU_TEST_B;
  });

  it("replaces ${VAR} with env or empty string", () => {
    process.env.NAXEU_TEST_A = "x";
    expect(interpolateEnv("pre-${NAXEU_TEST_A}-post")).toBe("pre-x-post");
    delete process.env.NAXEU_TEST_A;
    expect(interpolateEnv("pre-${NAXEU_TEST_A}-post")).toBe("pre--post");
  });

  it("uses ${VAR:-default} when variable is missing or blank", () => {
    delete process.env.NAXEU_TEST_A;
    expect(interpolateEnv("${NAXEU_TEST_A:-hello}")).toBe("hello");
    process.env.NAXEU_TEST_A = "   ";
    expect(interpolateEnv("${NAXEU_TEST_A:-hello}")).toBe("hello");
    process.env.NAXEU_TEST_A = "ok";
    expect(interpolateEnv("${NAXEU_TEST_A:-hello}")).toBe("ok");
  });

  it("allows empty default ${VAR:-}", () => {
    delete process.env.NAXEU_TEST_B;
    expect(interpolateEnv("${NAXEU_TEST_B:-}")).toBe("");
  });
});
