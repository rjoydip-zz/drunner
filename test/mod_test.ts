import {} from "../src/mod.ts";
import { assertEquals, assertThrows } from "./test_deps.ts";

const { test } = Deno;

test("pass", (): void => {
  assertEquals(true, true);
});

test("fail", (): void => {
  assertThrows(() => {
    throw new Error("Please provide an input");
  });
});
