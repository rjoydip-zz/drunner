#!/usr/bin/env -S deno

import { parse } from "./deps.ts";
import { processor } from "./mod.ts";

const main = async () => {
  const _cwd = Deno.cwd();
  const _args = parse(Deno.args);

  try {
    const { output: procOutput, error: procError } = await processor({
      pwd: _cwd,
      filename: _args.i ||
        _args.input ||
        _args._.filter((inp: string | number) =>
          inp.toString().endsWith(".yaml")
        )[0] ||
        "runner.yaml",
      output: {
        pretty: _args.pretty,
        noColor: _args.noColor,
        prefix: _args.prefix,
      },
    });

    if (procOutput) {
      console.log();
      console.log(procOutput);
    }
    if (procError) {
      console.error(procError);
    }

    Deno.exit(0);
  } catch (error) {
    console.error(error);
    Deno.exit(1);
  }
};

await main();
