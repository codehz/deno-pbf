import { compile, parse } from "../mod.ts";
import { expandGlob } from "https://deno.land/std@0.177.0/fs/expand_glob.ts";
import { fromFileUrl, join } from "https://deno.land/std@0.177.0/path/mod.ts";

Deno.chdir(join(fromFileUrl(import.meta.url), ".."));
for await (const entry of expandGlob("./*.proto")) {
  const contents = await Deno.readTextFile(entry.path);
  const schema = parse(contents);
  const compiled = compile(schema);
  const outputPath = entry.path.replace(/\.proto/g, ".generated.ts");
  await Deno.writeTextFile(outputPath, compiled);
}
