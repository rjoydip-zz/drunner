import { colors, parseYaml, path } from "./deps.ts";

type Languages = "sh" | "cmd" | "js" | "go" | "php";

type RunType = {
  script: string;
  lang: Languages;
  return: boolean;
  default: string | number | null;
};

type StepType = {
  [x: string]: string | Record<string, unknown> | null | undefined;
  name: string;
  description?: string;
  with?: { [x: string]: string };
  run?: string | RunType;
};

type JobType = {
  [x: string]: {
    steps?: StepType[];
  };
};

type OutputVars = {
  colored: boolean;
  pretty: boolean;
  prefix: string;
  title?: string;
};

type Variables = {
  [x: string]: string | Record<string, unknown>;
  pwd: string;
  output: OutputVars;
};

type ProcessorIO = { output: string; title: string };

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
const exec = async (cmd: string[] | ExecOptions) => {
  let opts: Deno.RunOptions = {
    cmd: [],
  };

  if (Array.isArray(cmd)) {
    opts.cmd = cmd;
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
  input: ProcessorIO[];
  globalVar: Variables;
}) => {
  return input
    .map((i) =>
      !!globalVar.output.prefix
        ? (!!globalVar.output.colored
            ? colors.red(i.title.trim() + ": ")
            : i.title.trim() + ": ") + i.output.trim()
        : i.output.trim()
    )
    .join("\n");
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
      return step.run === undefined
        ? {
            title: step[index],
            output: "",
          }
        : Promise.all([
            ...(await (typeof step.run === "string"
              ? step.run
              : step.run?.script ?? ""
            )
              .split("\n")
              .filter((i) => !!i)
              .map(async (run: string) => {
                const executedRes = await exec(
                  run
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
                    .split(" ")
                );
                return {
                  title: step[index],
                  output:
                    typeof step.run === "string" ||
                    (typeof step.run?.script === "string" && !!step.run?.return)
                      ? executedRes.concat("\n")
                      : (step.run?.return === false || step.run?.return === null) ? "": step.run?.return,
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
  return jobOutput.flat(Infinity).filter((i) => !!i);
};

// Processor
export const processor = async ({
  pwd,
  filename,
  output,
}: {
  pwd: string;
  filename: string;
  output: OutputVars;
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
        prefix: output.prefix || yc.variables?.output?.prefix || "",
        pretty: !!(output.pretty || yc.variables?.output?.pretty),
        colored: !!(output.colored || yc.variables?.output?.colored),
        title: yc.name || "",
      },
      pwd: path.join(pwd, yc.variables?.pwd || "/"),
    };

    return {
      output: prettyOutput({
        input: <ProcessorIO[]>await jobProcessor(yc.jobs, yc.variables) || "",
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
