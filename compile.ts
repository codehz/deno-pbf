// deno-lint-ignore-file no-explicit-any

import {
  Enum,
  Field,
  Message,
  parse,
  Schema,
} from "./protocol-buffers-schema.ts";

import { join, posix } from "https://deno.land/std@0.177.0/path/mod.ts";

export type CompilerOptions = {
  parse: typeof parse;
  basedir: string;
};

abstract class CodegenContext {
  abstract options: CompilerOptions;
  abstract indent: number;
  abstract addEnum(fullname: string): void;
  abstract isEnum(fullname: string, original?: string): boolean;
  next(name?: string): CodegenContext {
    if (name) {
      return new CodegenSubContext(this.options, this.indent + 1, this, name);
    }
    return new CodegenIndentContext(this.options, this.indent + 1, this);
  }
  wrap<R>(cb: (ctx: CodegenContext) => R): R;
  wrap<R>(name: string, cb: (ctx: CodegenContext) => R): R;
  wrap(...args: any[]) {
    if (args.length === 2) {
      return args[1](this.next(args[0]));
    }
    return args[0](this.next());
  }
  #renderSpace(addition: number) {
    return "  ".repeat(this.indent + addition);
  }
  single(text: string, addition = 0) {
    return this.#renderSpace(addition) + text + "\n";
  }
  multi(...text: string[]) {
    return text.map((line) => this.single(line)).join("\n");
  }
}

class CodegenIndentContext extends CodegenContext {
  constructor(
    public readonly options: CompilerOptions,
    public readonly indent: number = 0,
    public readonly parent: CodegenContext,
  ) {
    super();
  }
  addEnum(fullname: string): void {
    this.parent.addEnum(fullname);
  }
  isEnum(fullname: string, original = fullname): boolean {
    return this.parent.isEnum(fullname, original);
  }
}

class CodegenSubContext extends CodegenContext {
  constructor(
    public readonly options: CompilerOptions,
    public readonly indent: number = 0,
    public readonly parent: CodegenContext,
    public readonly name: string,
  ) {
    super();
  }
  addEnum(fullname: string): void {
    this.parent.addEnum(this.name + "." + fullname);
  }
  isEnum(fullname: string, original = fullname): boolean {
    return this.parent.isEnum(this.name + "." + fullname, original) ||
      (fullname !== original &&
        this.parent.isEnum(this.name + "." + original, original));
  }
}

class CodegenRootContext extends CodegenContext {
  #enums = new Set<string>();
  constructor(
    public readonly options: CompilerOptions,
    public readonly indent: number = 0,
    public readonly parent?: CodegenRootContext,
  ) {
    super();
  }

  addEnum(fullname: string) {
    this.#enums.add(fullname);
  }

  isEnum(fullname: string, original = fullname): boolean {
    return this.#enums.has(fullname) ||
      (original !== fullname && this.#enums.has(original));
  }
}

function transformEnum(ctx: CodegenContext, source: Enum) {
  let buffer = "";
  buffer += ctx.single(`export enum ${source.name} {`);
  ctx.wrap(source.name, (ctx) => {
    for (const [key, { value }] of Object.entries(source.values)) {
      buffer += ctx.single(`${key} = ${value},`);
    }
  });
  buffer += ctx.single(`}`);
  return buffer;
}

function pbTypeMap({
  type,
  map,
  repeated,
}: {
  type: string;
  map?: { from: string; to: string };
  repeated?: boolean;
}): string {
  switch (type) {
    case "double":
    case "float":
    case "int32":
    case "int64":
    case "uint32":
    case "uint64":
    case "sint32":
    case "sint64":
    case "fixed32":
    case "fixed64":
    case "sfixed32":
    case "sfixed64":
      return `number${repeated ? "[]" : ""} /* ${type} */`;
    case "bytes":
      return `Uint8Array${repeated ? "[]" : " | undefined"}`;
    case "map":
      // deno-fmt-ignore
      return `Record<${pbTypeMap({ type: map!.from })}, ${pbTypeMap({ type: map!.to })}>`;
    case "string":
      return `string${repeated ? "[]" : ""}`;
    default:
      return `${type}${repeated ? "[]" : " | undefined"}`;
  }
}

function pbTypeDefault(source: string): string {
  switch (source) {
    case "double":
    case "float":
    case "int32":
    case "int64":
    case "uint32":
    case "uint64":
    case "sint32":
    case "sint64":
    case "fixed32":
    case "fixed64":
    case "sfixed32":
    case "sfixed64":
      return "0";
    case "map":
      return "{}";
    case "string":
      return '""';
    default:
      return "undefined";
  }
}

function transformFieldsForInterface(ctx: CodegenContext, source: Field) {
  let buffer = "";
  if (source.options.deprecated) {
    buffer += ctx.single(`/** @deprecated */`);
  }
  buffer += ctx.single(`${source.name}: ${pbTypeMap(source)},`);
  return buffer;
}

function transformFieldsForRead(ctx: CodegenContext, fields: Field[]) {
  let buffer = "";
  buffer += ctx.single(`export function read(pbf: Pbf, end?: number) {`);
  ctx.wrap((ctx) => {
    buffer += ctx.single(`return pbf.readFields(_readField, {`);
    buffer += ctx.wrap((ctx) =>
      fields.map(({ name, type, repeated, options }) =>
        ctx.single(
          `${name}: ${
            repeated ? "[]" : options["js_default"] ?? options["default"] ??
              pbTypeDefault(type)
          },`,
        )
      )
    ).join("");
    buffer += ctx.single(`}, end);`);
  });
  buffer += ctx.single(`}`);
  return buffer;
}

function normalizeTypeName(ctx: CodegenContext, type: string): string {
  if (ctx.isEnum(type)) return "enum";
  return type;
}

function isPacked(type: string) {
  switch (type) {
    case "float":
    case "double":
    case "uint32":
    case "uint64":
    case "int32":
    case "int64":
    case "sint32":
    case "sint64":
    case "fixed32":
    case "fixed64":
    case "sfixed32":
    case "bool":
    case "enum":
      return true;
    default:
      return false;
  }
}

const TYPENAMES: Record<string, string> = new Proxy({
  "string": "String",
  "float": "Float",
  "double": "Double",
  "boolean": "Boolean",
  "enum": "Varint",
  "uint32": "Varint",
  "uint64": "Varint",
  "int32": "Varint",
  "int64": "Varint",
  "sint32": "SVarint",
  "sint64": "SVarint",
  "fixed32": "Fixed32",
  "fixed64": "Fixed64",
  "sfixed32": "SFixed32",
  "sfixed64": "SFixed64",
  "bytes": "Bytes",
}, {
  get(original, name) {
    if (name in original) {
      return Reflect.get(original, name);
    } else {
      return name;
    }
  },
});

function mapKV(map: { from: string; to: string }): Field[] {
  return [{
    name: "key",
    tag: 1,
    type: map.from,
  }, {
    name: "value",
    tag: 2,
    type: map.to,
  }] as any;
}

function generateReadFunction(
  ctx: CodegenContext,
  { name, repeated, type, map }: Field,
): string {
  const normalized = normalizeTypeName(ctx, type);
  const packed = isPacked(normalized);
  if (repeated) {
    if (packed) {
      return ctx.single(`pbf.readPacked${TYPENAMES[normalized]}(obj.${name});`);
    } else {
      return ctx.single(
        `obj.${name}.push(${normalized}.read(pbf, pbf.readVarint() + pbf.pos));`,
      );
    }
  } else {
    if (normalized == "map") {
      let buffer = "";
      buffer += ctx.single(`const { key, value } = pbf.readFields(`);
      ctx.wrap((ctx) => {
        const keytype = pbTypeMap({ type: map.from });
        const valtype = pbTypeMap({ type: map.to });
        const keydef = pbTypeDefault(map.from);
        const valdef = pbTypeDefault(map.to);
        buffer += ctx.single(
          `(tag: number, obj: { key: ${keytype}; value: ${valtype} }) => {`,
        );
        buffer += ctx.wrap((ctx) =>
          transformFieldsForReadFieldsInner(ctx, mapKV(map))
        );
        buffer += ctx.single(`},`);
        buffer += ctx.single(`{ key: ${keydef}, value: ${valdef} },`);
        buffer += ctx.single(`pbf.readVarint() + pbf.pos,`);
      });
      buffer += ctx.single(`);`);
      buffer += ctx.single(`obj.${name}[key] = value;`);
      return buffer;
    } else if (normalized in TYPENAMES) {
      return ctx.single(`obj.${name} = pbf.read${TYPENAMES[normalized]}();`);
    } else {
      return ctx.single(
        `obj.${name} = ${normalized}.read(pbf, pbf.readVarint() + pbf.pos);`,
      );
    }
  }
}

function transformFieldsForReadFieldsInner(
  ctx: CodegenContext,
  fields: Field[],
) {
  let buffer = "";
  let first = true;
  for (const field of fields) {
    buffer += ctx.single(
      `${first ? "" : "} else "}if (tag === ${field.tag}) {`,
    );
    buffer += ctx.wrap((ctx) => generateReadFunction(ctx, field));
    first = false;
  }
  // buffer += ctx.single(`case ${}`);
  buffer += ctx.single(`}`);
  return buffer;
}

function transformFieldsForReadFields(
  ctx: CodegenContext,
  name: string,
  fields: Field[],
) {
  let buffer = "";
  buffer += ctx.single(
    `function _readField(tag: number, obj: ${name}, pbf: Pbf) {`,
  );
  buffer += ctx.wrap(
    name,
    (ctx) => transformFieldsForReadFieldsInner(ctx, fields),
  );
  buffer += ctx.single(`}`);
  return buffer;
}

function generateWriteFunction(
  ctx: CodegenContext,
  { name, tag, repeated, type, map }: Field,
) {
  const normalized = normalizeTypeName(ctx, type);
  const packed = isPacked(normalized);
  if (repeated) {
    if (packed) {
      return ctx.single(
        `pbf.writePacked${TYPENAMES[normalized]}(${tag}, obj.${name});`,
      );
    } else {
      let buffer = "";
      buffer += ctx.single(`for (const item of obj.${name}) {`);
      buffer += ctx.wrap((ctx) =>
        ctx.single(`pbf.writeMessage(${tag}, ${normalized}.write, item);`)
      );
      buffer += ctx.single(`}`);
      return buffer;
    }
  } else {
    if (normalized === "map") {
      let buffer = "";
      const keytype = pbTypeMap({ type: map.from });
      const valtype = pbTypeMap({ type: map.to });
      buffer += ctx.single(
        `for (const [key, value] of Object.entries(obj.${name})) {`,
      );
      ctx.wrap((ctx) => {
        buffer += ctx.single(`pbf.writeMessage(`);
        ctx.wrap((ctx) => {
          buffer += ctx.single(`${tag},`);
          buffer += ctx.single(
            `(obj: { key: ${keytype}; value: ${valtype} }, pbf: Pbf) => {`,
          );
          buffer += ctx.wrap((ctx) =>
            transformFieldsForWriteInner(ctx, mapKV(map))
          );
          buffer += ctx.single(`},`);
          buffer += ctx.single(`{ key, value },`);
        });
        buffer += ctx.single(`);`);
      });
      buffer += ctx.single(`}`);
      return buffer;
    } else if (normalized in TYPENAMES) {
      return ctx.single(
        `pbf.write${TYPENAMES[normalized]}Field(${tag}, obj.${name});`,
      );
    } else {
      return ctx.single(
        `pbf.writeMessage(${tag}, ${normalized}.write, obj.${name});`,
      );
    }
  }
}

function transformFieldsForWriteInner(
  ctx: CodegenContext,
  fields: Field[],
) {
  let buffer = "";
  for (const field of fields) {
    buffer += ctx.single(`if (obj.${field.name} != null) {`);
    ctx.wrap((ctx) => {
      buffer += generateWriteFunction(ctx, field);
    });
    buffer += ctx.single(`}`);
  }
  return buffer;
}

function transformFieldsForWrite(
  ctx: CodegenContext,
  name: string,
  fields: Field[],
) {
  let buffer = "";
  buffer += ctx.single(
    `export function write(obj: Partial<${name}>, pbf: Pbf) {`,
  );
  buffer += ctx.wrap(name, (ctx) => transformFieldsForWriteInner(ctx, fields));
  buffer += ctx.single(`}`);
  return buffer;
}

function transformMessage(ctx: CodegenContext, source: Message) {
  source.enums.forEach((e) => ctx.next(source.name).addEnum(e.name));
  let buffer = "";
  buffer += "\n";
  buffer += ctx.single(`export namespace ${source.name} {`);
  buffer += ctx
    .wrap(source.name, (ctx) => source.enums.map((x) => transformEnum(ctx, x)))
    .join("");
  buffer += ctx
    .wrap((ctx) => source.messages.map((x) => transformMessage(ctx, x)))
    .join("");
  ctx.wrap((ctx) => {
    if (source.options.deprecated) {
      buffer += ctx.single(`/** @deprecated */`);
    }
    buffer += ctx.single(`export interface ${source.name} {`);
    buffer += ctx.wrap((ctx) =>
      source.fields.map((x) => transformFieldsForInterface(ctx, x))
    ).join("");
    buffer += ctx.single(`}`);
  });
  buffer += ctx.wrap((ctx) => transformFieldsForRead(ctx, source.fields));
  buffer += ctx.wrap((ctx) =>
    transformFieldsForReadFields(ctx, source.name, source.fields)
  );
  buffer += ctx.wrap((ctx) =>
    transformFieldsForWrite(ctx, source.name, source.fields)
  );
  buffer += ctx.single(`}`);
  buffer += ctx.single(
    `export type ${source.name} = ${source.name}.${source.name};`,
  );
  return buffer;
}

function scanImportedEnums(ctx: CodegenContext, schema: Schema | Message) {
  schema.enums.forEach((e) => ctx.addEnum(e.name));
  schema.messages.forEach((m) => scanImportedEnums(ctx.next(m.name), m));
}

function getTopLevelExports(ctx: CodegenContext, path: string): string[] {
  const fullpath = join(ctx.options.basedir, path);

  const content = Deno.readTextFileSync(fullpath);
  const schema = ctx.options.parse(content);
  scanImportedEnums(ctx, schema);
  return [
    ...schema.enums.map(({ name }) => name),
    ...schema.messages.map(({ name }) => name),
  ];
}

function transformImport(ctx: CodegenContext, source: string) {
  let buffer = "";
  const path = posix.normalize(source.replace(/\.proto$/g, ".generated.ts"));
  const exports = getTopLevelExports(ctx, source);

  buffer += ctx.single(`import {`);
  buffer += ctx.wrap((ctx) => exports.map((x) => ctx.single(x + ","))).join("");
  buffer += ctx.single(`} from ${JSON.stringify("./" + path)};`);

  return buffer;
}

function transformSchema(ctx: CodegenContext, schema: Schema): string {
  schema.enums.forEach((e) => ctx.addEnum(e.name));
  const list = [];
  list.push(...schema.imports.map((x) => transformImport(ctx, x)));
  list.push(...schema.enums.map((x) => transformEnum(ctx, x)));
  list.push(...schema.messages.map((x) => transformMessage(ctx, x)));
  return list.join("");
}

export function compile(
  schema: Schema,
  options?: Partial<CompilerOptions>,
): string {
  const fulloptions = {
    parse,
    basedir: ".",
    ...options,
  } as CompilerOptions;
  let result = "";
  const ctx = new CodegenRootContext(fulloptions);

  result += ctx.single(`// deno-lint-ignore-file`);
  result += ctx.single(`// deno-fmt-ignore-file`);
  result += `import { Pbf } from "${new URL("mod.ts", import.meta.url)}"\n`;
  result += transformSchema(ctx, schema);
  return result;
}
