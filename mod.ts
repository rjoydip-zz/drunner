import { parseYaml, path } from "./deps.ts";

type StepType = {
  name: string;
  description?: string;
  with?: { [x: string]: string };
  run?: string;
};

type JobType = {
  [x: string]: {
    steps?: StepType[];
  };
};

type GlobalVar = {
  [x: string]: string;
  pwd: string;
};

type YamlType = {
  name: string | null;
  var?: GlobalVar;
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

// Parse YAML file
const parseYAMLFile = async (filePath: string) => {
  const yamlFile = await Deno.readFile(filePath);
  return <YamlType>await parseYaml(new TextDecoder("utf-8").decode(yamlFile));
};

// Processors
const stepsProcessor = async (steps: StepType[] = [], globalVar: GlobalVar) => {
  return await Promise.all([
    ...steps.map(async (step: StepType) => {
      return step.run?.toString() === undefined
        ? Promise.resolve([""])
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
                return executedRes.concat("\n");
              })),
          ]);
    }),
  ]);
};

// Job processor
const jobProcessor = async (jobs: JobType = {}, globalVar: GlobalVar) => {
  const jobOutput = [];
  for (const jobName of Object.keys(jobs)) {
    jobOutput.push(await stepsProcessor(jobs[jobName].steps, globalVar));
  }
  return jobOutput.flat(Infinity).join("").trim(); // triming last "\n"
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

// Processor
export const processor = async ({
  pwd,
  filename,
}: {
  pwd: string;
  filename: string;
}): Promise<{
  output: string | null;
  error: string | null;
}> => {
  const yamlFileContent: YamlType = await parseYAMLFile(
    path.join(pwd, filename)
  );
  const yc = Object.assign(
    {
      var: {},
    },
    yamlFileContent
  );
  const {
    isValid: isValidYAMLFile,
    error: yamlErrorMessage,
  } = validateYAMLFile({
    content: yamlFileContent,
  });
  if (isValidYAMLFile) {
    yc.var = { ...yc.var, pwd: path.join(pwd, yc.var.pwd || "/") };
    return {
      output: await jobProcessor(yc.jobs, yc.var),
      error: null,
    };
  } else {
    return {
      output: null,
      error: yamlErrorMessage,
    };
  }
};
