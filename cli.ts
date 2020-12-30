#!/usr/bin/env -S deno

import { colors, isUndefined, parse } from "./deps.ts";
import { processor } from "./mod.ts";

const main = async () => {
  const _cwd = Deno.cwd();
  const _args = parse(Deno.args);
  try {
    const { output: procOutput, error: procError } = await processor({
      pwd: _cwd,
      filename: _args.i ||
        _args.input ||
        _args._.filter((inp) => inp.toString().endsWith(".yaml")).pop() ||
        "runner.yaml",
      output: {
        pretty: _args.pretty,
        prefix: isUndefined(_args.prefix) ? "" : _args.prefix,
      },
    });

    if (procOutput) {
      console.log();
      console.log(procOutput);
    }
    if (procError) {
      console.log();
      console.log(colors.red(procError));
    }

    Deno.exit();
  } catch (error) {
    console.log(error);
    Deno.exit(1);
  }
};

await main();
