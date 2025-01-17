export * from "./reader.js";
export * from "./writer.js";
export * from "./json.js";

import type { BinaryWriter } from "google-protobuf";

export type ByteSource = ArrayBuffer | Uint8Array | number[] | string;
export type PartialDeep<T> = {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  [P in keyof T]?: NonNullable<T[P]> extends any[] | Uint8Array
    ? T[P]
    : NonNullable<T[P]> extends object
      ? PartialDeep<T[P]>
      : T[P];
  /* eslint-enable @typescript-eslint/no-explicit-any */
};

export const EMPTY_BIN = new Uint8Array(0);

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Encoder = (msg: any, writer: BinaryWriter) => BinaryWriter;

export const encoderWithPos =
  (
    /* eslint-disable @typescript-eslint/no-explicit-any */
    writer_li: [(self: BinaryWriter, field: number, value: any) => void],
    pos_li: [number | undefined],
  ): Encoder =>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (msg: [any], writer: BinaryWriter): BinaryWriter => {
    msg.forEach(
      /* eslint-disable @typescript-eslint/no-explicit-any */
      (m: any, pos: number): void => {
        writer_li[pos](writer, pos_li[pos] ?? pos + 1, m);
      },
    );
    return writer;
  };

export const encoder1 =
  (
    /* eslint-disable @typescript-eslint/no-explicit-any */
    writer_func: (self: BinaryWriter, field: number, value: any) => void,
    pos: number = 1,
  ): Encoder =>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (msg: any, writer: BinaryWriter): BinaryWriter => {
    writer_func(writer, pos, msg);
    return writer;
  };

export const encoder =
  (
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ...writer_li: [(self: BinaryWriter, field: number, value: any) => void]
  ): Encoder =>
  /* eslint-disable @typescript-eslint/no-explicit-any */
  (msg: [any], writer: BinaryWriter): BinaryWriter => {
    msg.forEach(
      /* eslint-disable @typescript-eslint/no-explicit-any */
      (m: any, pos: number) => {
        writer_li[pos](writer, pos + 1, m);
      },
    );
    return writer;
  };
