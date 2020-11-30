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
  name?: string;
  var?: GlobalVar;
  jobs?: JobType;
};

type ExecOptions = Omit<Deno.RunOptions, "stdout" | "stderr">;

const removeTrailingLineBreak = (str: string) => {
  return str.replace(/^\\|\n$/, "").replace(/\"\n/, "");
};

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

const parseYAMLFile = async (filePath: string) => {
  const yamlFile = await Deno.readFile(filePath);
  return await parseYaml(new TextDecoder("utf-8").decode(yamlFile));
};

// Processors
const stepsProcessor = async (steps: StepType[] = [], globalVar: GlobalVar) => {
  return (
    await Promise.all([
      ...steps.map(async (step: StepType) => {
        return await exec(
          step.run?.replace(/(\$\w+)/g, (match: string) => {
            return { ...step.with, ...globalVar }[
              match.slice(1, match.length)
            ].toString();
          }) || ""
        );
      }),
    ])
  ).join("");
};

const jobProcessor = async (jobs: JobType = {}, globalVar: GlobalVar) => {
  const jobOutput = [];
  for (const jobName of Object.keys(jobs)) {
    if (jobs[jobName])
      jobOutput.push(await stepsProcessor(jobs[jobName].steps, globalVar));
  }
  return jobOutput.join("");
};

export const processor = async ({
  pwd,
  filename,
}: {
  pwd: string;
  filename: string;
}) => {
  let jobProcessorOutput;
  const yamlFileContent = await parseYAMLFile(path.join(pwd, filename));
  const yc: YamlType = Object.assign({}, yamlFileContent);
  yc.jobs = yc.jobs != null ? yc.jobs : {};
  yc.var =
    yc.var != null
      ? { ...yc.var, pwd: path.join(pwd, yc.var.pwd) }
      : { pwd: pwd };
  if (yc.jobs) jobProcessorOutput = await jobProcessor(yc.jobs, yc.var);
  return jobProcessorOutput;
};
