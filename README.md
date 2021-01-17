# drunner

![Drunner CI](https://github.com/rjoydip/drunner/workflows/Drunner%20CI/badge.svg)
![Drunner Release CI](https://github.com/rjoydip/drunner/workflows/Drunner%20Release%20CI/badge.svg?branch=v0.0.1)

> Deno task runner for automation pipelines script sequential task workflow steps in yaml conditional execution, loops, error handling & retries.

## Install

```sh
deno install -f --name drunner https://raw.githubusercontent.com/rjoydip/drunner/mod.ts
```

## Example

```yml
name: Test runner

variables:
  hello: world
  pwd: /test

jobs:
  job1:
    steps:
      - name: Test
        description: Test description
        with:
          version: t1.0.0.0000
        run: echo "Test version $version"

      - name: Build
        description: Build description
        with:
          version: b1.0.0.0000
        run: |
          echo "Build version $version and $pwd"

  job2:
    steps:
      - name: Deploy
        description: Deploy description
        with:
          version: v1.0.0
        run: |
          echo "Deploy version $version"
          echo "multiline"

      - name: Echo sh
        description: Run example sh file
        run: sh  ./echo.sh
        
      - name: No return
        description: Golang version desc
        run: 
          script: echo "No return"
          return: false
  job3:
    steps:
      - name: Deno version
        description: Deno version desc
        run: deno --version
      
      - name: Node.js version
        description: Node.js version desc
        run: node --version
```

## Usage CLI

```sh
drunner runner.yaml
```

## Run locally

```sh
deno run --import-map=import_map.json --allow-run --allow-read --unstable cli.ts test/runner.yaml
```
