export type ReadFieldFn<T> = (tag: number, obj: T, pbf: Pbf) => void;
export type WriteFn<T> = (obj: T, pbf: Pbf) => void;

declare class Pbf {
  static Varint: 0;
  static Fixed64: 1;
  static Bytes: 2;
  static Fixed32: 5;

  pos: number;

  constructor(buf?: BufferSource);

  destroy(): void;

  readFields<T>(
    readFields: ReadFieldFn<T>,
    result: T,
    end?: number,
  ): T;

  readMessage<T>(
    readFields: ReadFieldFn<T>,
    result: T,
  ): T;

  readFixed32(): number;
  readSFixed32(): number;
  readFixed64(): number;
  readSFixed64(): number;
  readFloat(): number;
  readDouble(): number;
  readVarint(isSigned?: boolean): number;
  readVarint64(): number;
  readSVarint(): number;
  readBoolean(): boolean;
  readString(): string;
  readBytes(): Uint8Array;
  readPackedVarint(arr: number[], isSigned?: boolean): number[];
  readPackedSVarint(arr: number[]): number[];
  readPackedBoolean(arr: boolean[]): boolean[];
  readPackedFloat(arr: number[]): number[];
  readPackedDouble(arr: number[]): number[];
  readPackedFixed32(arr: number[]): number[];
  readPackedSFixed32(arr: number[]): number[];
  readPackedFixed64(arr: number[]): number[];
  readPackedSFixed64(arr: number[]): number[];

  skip(val: number): void;

  writeTag(tag: number, type: number): void;
  realloc(min: number): void;
  finish(): Uint8Array;

  writeFixed32(val: number): void;
  writeSFixed32(val: number): void;
  writeFixed64(val: number): void;
  writeSFixed64(val: number): void;
  writeVarint(val: number): void;
  writeSVarint(val: number): void;
  writeBoolean(val: boolean): void;
  writeString(val: string): void;
  writeFloat(val: number): void;
  writeDouble(val: number): void;
  writeBytes(val: Uint8Array): void;

  writeRawMessage<T>(fn: WriteFn<T>, obj: Partial<T>): void;
  writeMessage<T>(tag: number, fn: WriteFn<T>, obj: Partial<T>): void;

  writePackedFixed32(tag: number, val: number[]): void;
  writePackedSFixed32(tag: number, val: number[]): void;
  writePackedFixed64(tag: number, val: number[]): void;
  writePackedSFixed64(tag: number, val: number[]): void;
  writePackedVarint(tag: number, val: number[]): void;
  writePackedSVarint(tag: number, val: number[]): void;
  writePackedBoolean(tag: number, val: boolean[]): void;
  writePackedFloat(tag: number, val: number[]): void;
  writePackedDouble(tag: number, val: number[]): void;

  writeFixed32Field(tag: number, val: number): void;
  writeSFixed32Field(tag: number, val: number): void;
  writeFixed64Field(tag: number, val: number): void;
  writeSFixed64Field(tag: number, val: number): void;
  writeVarintField(tag: number, val: number): void;
  writeSVarintField(tag: number, val: number): void;
  writeBooleanField(tag: number, val: boolean): void;
  writeStringField(tag: number, val: string): void;
  writeFloatField(tag: number, val: number): void;
  writeDoubleField(tag: number, val: number): void;
  writeBytesField(tag: number, val: Uint8Array): void;
}

export default Pbf;
