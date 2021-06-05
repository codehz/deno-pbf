import { assertEquals } from "https://deno.land/std@0.97.0/testing/asserts.ts";

import { Data } from "./ipfs-unixfs.generated.ts";
import { Pbf } from "../mod.ts";

Deno.test("CAE=", () => {
  const pbf = new Pbf();
  Data.write({ Type: Data.DataType.Directory }, pbf);
  const data = pbf.finish();
  assertEquals(data, new Uint8Array([8, 1]));
});
