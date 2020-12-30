import { parseYaml, path, AsciiTable, isString, isNull } from "./deps.ts";
import * as ink from "https://deno.land/x/ink/mod.ts";

type StepType = {
  name: string;
  description?: string;
  with?: { [x: string]: string };
  run?: string;
  [x: string]: string | object | null | undefined;
};

type JobType = {
  [x: string]: {
    steps?: StepType[];
  };
};

type OutputVars = {
  table: boolean;
  prefix: string;
  title?: string;
};

type Variables = {
  [x: string]: string | object;
  pwd: string;
  output: OutputVars;
};

type YamlType = {
  name: string | null;
  variables?: Variables;
  jobs: JobType;
};

type ExecOptions = Omit<Deno.RunOptions, "stdout" | "stderr">;

// Format standard output/error
const removeTrailingLineBreak = (str: string) => {
  return str.replace(/^\\|\n$/, "").replace(/\"\n/, "");
};

// Execute command
const exec = async (cmd: string | string[] | ExecOptions) => {
  let opts: Deno.RunOptions;

  if (typeof cmd === "string") {
    opts = {
      cmd: cmd.split(" "),
    };
  } else if (Array.isArray(cmd)) {
    opts = {
      cmd,
    };
  } else {
    opts = cmd;
  }

  opts.stdout = "piped";
  opts.stderr = "piped";

  const process = Deno.run(opts);
  const decoder = new TextDecoder();
  const { success } = await process.status();

  if (!success) {
    process.close();
    throw new Error(
      removeTrailingLineBreak(decoder.decode(await process.stderrOutput())) ||
        "exec: failed to execute command"
    );
  }

  return removeTrailingLineBreak(decoder.decode(await process.output()));
};

// Pretty output
const prettyOutput = ({
  input,
  globalVar,
}: {
  input:
    | {
        title: string;
        data: string;
      }[]
    | string;
  globalVar: Variables;
}) => {
  if (isString(input)) {
    return input;
  } else {
    if (globalVar.output.table) {
      console.log(
        input
          .map((i) => {
            return i.data.split("\n").length > 2
              ? {
                  ...i,
                  data: i.data.split("\n"),
                }
              : i;
          })
      );
      const table = AsciiTable.fromJSON({
        title: globalVar.output.title || "",
        heading: [globalVar.output.prefix, "Value"],
        rows: [
          ...input
            .map((i) => {
              return i;
            })
            .map((i) => [i.title.trim().toString(), i.data.trim().toString()]),
        ],
      });
      return table.toString();
    } else {
      return input.map((i) => i.title.trim() + ": " + i.data.trim()).join("\n");
    }
  }
};

// Parse YAML file
const parseYAMLFile = async (filePath: string) => {
  const yamlFile = await Deno.readFile(filePath);
  return <YamlType>await parseYaml(new TextDecoder("utf-8").decode(yamlFile));
};

// Validate YAML file
const validateYAMLFile = ({
  content,
}: {
  content: YamlType;
}): { isValid: boolean; error: string | null } => {
  if (!content.name) {
    return { isValid: false, error: "Please provide name" };
  }
  if (!content.jobs) {
    return { isValid: false, error: "No job found" };
  }
  return { isValid: true, error: null };
};

// Processors
const stepsProcessor = async (steps: StepType[] = [], globalVar: Variables) => {
  const index: string = globalVar.output.prefix;
  return await Promise.all([
    ...steps.map(async (step: StepType) => {
      return step.run?.trim().toString() === undefined
        ? {
            title: step[index],
            data: "",
          }
        : Promise.all([
            ...(await step.run
              ?.toString()
              .split("\n")
              .filter((i) => !!i)
              .map(async (run: string) => {
                const executedRes = await exec(
                  run
                    .toString()
                    .replace(/(\$\w+)/g, (match: string) =>
                      ({ ...step.with, ...globalVar }[
                        match.slice(1, match.length)
                      ].toString())
                    )
                    .replace(
                      /(.\/|..\/)+(\w+\.\w+)/g,
                      (match: string) =>
                        ` ${path.join(globalVar.pwd, match.trim())}`
                    )
                    .replace(/\s+/, " ")
                );
                return {
                  title: step[index],
                  data: executedRes.concat("\n"),
                };
              })),
          ]);
    }),
  ]);
};

// Job processor
const jobProcessor = async (jobs: JobType = {}, globalVar: Variables) => {
  const jobOutput = [];
  for (const jobName of Object.keys(jobs)) {
    jobOutput.push(await stepsProcessor(jobs[jobName].steps, globalVar));
  }
  return jobOutput.flat(Infinity).filter((i) => !isNull(i));
};

// Processor
export const processor = async ({
  pwd,
  filename,
  output,
}: {
  pwd: string;
  filename: string;
  output: {
    table: boolean;
    prefix: string;
  };
}): Promise<{
  output: string | null;
  error: string | null;
}> => {
  const yamlFileContent: YamlType = await parseYAMLFile(
    path.join(pwd, filename)
  );
  const yc = Object.assign({}, yamlFileContent);
  const {
    isValid: isValidYAMLFile,
    error: yamlErrorMessage,
  } = validateYAMLFile({
    content: yamlFileContent,
  });
  if (isValidYAMLFile) {
    yc.name = yc.name || "";
    yc.variables = {
      ...yc.variables,
      output: {
        prefix: output.prefix || yc.variables?.output?.prefix || "name",
        table: !!(output.table || yc.variables?.output?.table),
        title: yc.name || "",
      },
      pwd: path.join(pwd, yc.variables?.pwd || "/"),
    };
    return {
      output: prettyOutput({
        input:
          <{ data: string; title: string }[]>(
            await jobProcessor(yc.jobs, yc.variables)
          ) || "",
        globalVar: yc.variables,
      }),
      error: null,
    };
  } else {
    return {
      output: null,
      error: yamlErrorMessage,
    };
  }
};
