import { compile, parse } from "./mod.ts";
import {
  Args,
  parse as parseCLI,
} from "https://deno.land/std@0.97.0/flags/mod.ts";

async function main(args: Args) {
  console.assert(args._.length > 0, "require at least 1 input file");
  console.assert(args._.length < 2, "require at most 1 input file");
  if (args._.length != 1) Deno.exit(1);
  const input = await Deno.readTextFile(args._[0] + "");
  const schema = parse(input);
  if (args.schema) {
    console.log(Deno.inspect(schema, {
      colors: true,
      depth: 100,
    }));
    return;
  }
  const generated = compile(schema);
  if (typeof args.output === "string") {
    await Deno.writeTextFile(args.output, generated);
  } else {
    console.log(generated);
  }
}

await main(parseCLI(Deno.args, {
  alias: { "output": "o" },
}));
