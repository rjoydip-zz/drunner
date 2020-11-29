import { parse, parseYaml, path } from "./deps.ts";

type StepType = {
  name: string;
  description: string;
  with: { [x: string]: number | string | boolean };
  run: string;
  lang: string;
};

type JobType = {
  [x: string]: {
    steps: StepType[];
  };
};

type GlobalVar = {
  [x: string]: number | string | boolean | null;
  pwd: string | null;
};

type YamlType = {
  name: string | null;
  var: GlobalVar;
  jobs: JobType;
};

const _cwd = Deno.cwd();
const INPUT_FILE_NAME = "runner.yaml";
const DEFAULT_YAML_CONTENT = {
  name: null,
  var: {
    pwd: null,
  },
  jobs: {},
};

const parseYAMLFile = async (filePath: string) => {
  const yamlFile = await Deno.readFile(filePath);
  return await parseYaml(new TextDecoder("utf-8").decode(yamlFile));
};

const stepsProcessor = (steps: StepType[], globalVar: GlobalVar) => {
  const _steps = steps.map((step: StepType) => {
    step.with = Object.assign(step.with, globalVar);
    step.run = step.run.replace(/(\$\w+)/g, (match: string) => {
      return step.with[match.slice(1, match.length)].toString();
    });
    return step;
  });
  console.log("Steps Processor: ", _steps);
};

const jobProcessor = ({
  jobs,
  var: globalVar,
}: {
  jobs: JobType;
  var: GlobalVar;
}) => {
  for (const jobName of Object.keys(jobs)) {
    stepsProcessor(jobs[jobName]["steps"], globalVar);
  }
};

const processor = (yaml: unknown) => {
  const yc: YamlType = Object.assign(DEFAULT_YAML_CONTENT, yaml);
  yc.var.pwd = !!yc.var.pwd ? path.join(_cwd, yc.var.pwd) : _cwd;
  jobProcessor(yc);
};

const main = async () => {
  const _args = parse(Deno.args);
  const inputFile =
    _args.i ||
    _args.input ||
    _args._.filter((inp) => inp.toString().endsWith(".yaml")).pop() ||
    INPUT_FILE_NAME;
  try {
    const yamlFileContent = await parseYAMLFile(path.join(_cwd, inputFile));
    processor(yamlFileContent);
  } catch (error) {
    console.log(error);
    Deno.exit(1);
  }
};

await main();
