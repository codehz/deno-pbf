# Deno port of pbf

Original project: https://github.com/mapbox/pbf

Changes:

1. add typescript definition for runtime
2. rewrite the compiler to get typescript output

## Usage

CLI:

```bash
deno install --allow-read --allow-write --name pbf https://deno.land/x/pbf/cli.ts
```

```bash
pbf a.proto -o a.generated.ts
```

API:

```typescript
import { SomeMessage } from "./a.generated.ts";
import { Pbf } from "https://deno.land/x/pbf/mod.ts";

const pbf = new Pbf();
const data = SomeMessage.write({ key: "value" }, pbf);
```
