#!/usr/bin/env -S deno

import { parse } from "./deps.ts";
import { processor } from "./mod.ts";

const main = async () => {
  const _cwd = Deno.cwd();
  const _args = parse(Deno.args);
  try {
    const procOutput = await processor({
      pwd: _cwd,
      filename:
        _args.i ||
        _args.input ||
        _args._.filter((inp) => inp.toString().endsWith(".yaml")).pop() ||
        "runner.yaml",
    });
    console.log(procOutput);
    Deno.exit();
  } catch (error) {
    console.log(error);
    Deno.exit(1);
  }
};

await main();
