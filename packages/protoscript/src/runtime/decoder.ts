import { assert, fail } from "./goog/asserts.js";
import byteArrayToString from "@3-/utf8/utf8d.js";
import {
  ByteSource,
  byteSourceToUint8Array,
  fromZigzag64,
  joinFloat32,
  joinFloat64,
  joinHash64,
  joinInt64,
  joinSignedDecimalString,
  joinUint64,
  joinUnsignedDecimalString,
  joinZigzag64,
} from "./utils.js";

/**
 * Pops an instance off the instance cache, or creates one if the cache is
 * empty.
 */

const BYTES = 0,
  START = 1,
  END = 2,
  CURSOR = 3,
  ERROR = 4;

export type BinaryDecoder = [
  Uint8Array, // bytes
  number, // start
  number, // end
  number, // cursor
  boolean, // error
];

export const _alloc = (
  opt_bytes: ByteSource | undefined,
  opt_start: number | undefined,
  opt_length: number | undefined,
): BinaryDecoder => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const r: BinaryDecoder = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    undefined as any, // bytes
    0, // start
    0, // end
    0, // cursor
    false, // error
  ];
  if (opt_bytes) {
    _setBlock(r, opt_bytes, opt_start, opt_length);
  }
  return r;
};

/**
 * BinaryDecoder implements the decoders for all the wires specified in
 * https://developers.google.com/protocol-buffers/docs/encoding.
 */
// export class BinaryDecoder {
//   bytes_: Uint8Array;
//   start_: number;
//   end_: number;
//   cursor_: number;
//   error_: boolean;
//   constructor(
//     opt_bytes: ByteSource | undefined,
//     opt_start: number | undefined,
//     opt_length: number | undefined,
//   ) {
//     /**
//      * Typed byte-wise view of the source buffer.
//      */
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
//     this.bytes_ = undefined as any;
//
//     /**
//      * Start point of the block to read.
//      */
//     this.start_ = 0;
//
//     /**
//      * End point of the block to read.
//      */
//     this.end_ = 0;
//
//     /**
//      * Current read location in bytes_.
//      */
//     this.cursor_ = 0;
//
//     /**
//      * Set to true if this decoder encountered an error due to corrupt data.
//      */
//     this.error_ = false;
//
//     if (opt_bytes) {
//       _setBlock(this, opt_bytes, opt_start, opt_length);
//     }
//   }
// }

/**
 * Makes a copy of self decoder.
 */
export const clone = (self: BinaryDecoder): BinaryDecoder => {
  return _alloc(self[BYTES], self[START], self[END] - self[START]);
};

/**
 * Clears the decoder.
 */
export const _clear = (self: BinaryDecoder) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  self[BYTES] = undefined as any;
  self[START] = 0;
  self[END] = 0;
  self[CURSOR] = 0;
  self[ERROR] = false;
};

/**
 * Returns the raw buffer.
 */
export const _getBuffer = (self: BinaryDecoder): Uint8Array | undefined => {
  return self[BYTES];
};

/**
 * Changes the block of bytes we're decoding.
 */
export const _setBlock = (
  self: BinaryDecoder,
  data: ByteSource,
  opt_start: number | undefined,
  opt_length: number | undefined,
) => {
  self[BYTES] = byteSourceToUint8Array(data);
  self[START] = opt_start ?? 0;
  self[END] =
    opt_length !== undefined ? self[START] + opt_length : self[BYTES].length;
  self[CURSOR] = self[START];
};

export const _getEnd = (self: BinaryDecoder): number => {
  return self[END];
};

export const _setEnd = (self: BinaryDecoder, end: number) => {
  self[END] = end;
};

/**
 * Moves the read cursor back to the start of the block.
 */
export const _reset = (self: BinaryDecoder): void => {
  self[CURSOR] = self[START];
};

/**
 * Returns the internal read cursor.
 */
export const _getCursor = (self: BinaryDecoder): number => {
  return self[CURSOR];
};

/**
 * Returns the internal read cursor.
 */
export const _setCursor = (self: BinaryDecoder, cursor: number) => {
  self[CURSOR] = cursor;
};

/**
 * Advances the stream cursor by the given number of bytes.
 */
export const _advance = (self: BinaryDecoder, count: number) => {
  self[CURSOR] += count;
  assert(self[CURSOR] <= self[END]);
};

/**
 * Returns true if self decoder is at the end of the block.
 */
export const _atEnd = (self: BinaryDecoder): boolean => {
  return self[CURSOR] == self[END];
};

/**
 * Returns true if self decoder is at the end of the block.
 */
export const pastEnd = (self: BinaryDecoder): boolean => {
  return self[CURSOR] > self[END];
};

/**
 * Returns true if self decoder encountered an error due to corrupt data.
 */
export const _getError = (self: BinaryDecoder): boolean => {
  return self[ERROR] || self[CURSOR] < 0 || self[CURSOR] > self[END];
};

/**
 * Reads an unsigned varint from the binary stream and invokes the conversion
 * function with the value in two signed 32 bit integers to produce the result.
 * Since self does not convert the value to a number, no precision is lost.
 *
 * It's possible for an unsigned varint to be incorrectly encoded - more than
 * 64 bits' worth of data could be present. If self happens, self method will
 * throw an error.
 *
 * Decoding varints requires doing some funny base-128 math - for more
 * details on the format, see
 * https://developers.google.com/protocol-buffers/docs/encoding
 */
export const _readSplitVarint64 = <T>(
  self: BinaryDecoder,
  convert: (a: number, b: number) => T,
) => {
  let temp = 128;
  let lowBits = 0;
  let highBits = 0;

  // Read the first four bytes of the varint, stopping at the terminator if we
  // see it.
  for (let i = 0; i < 4 && temp >= 128; i++) {
    temp = self[BYTES][self[CURSOR]++];
    lowBits |= (temp & 0x7f) << (i * 7);
  }

  if (temp >= 128) {
    // Read the fifth byte, which straddles the low and high dwords.
    temp = self[BYTES][self[CURSOR]++];
    lowBits |= (temp & 0x7f) << 28;
    highBits |= (temp & 0x7f) >> 4;
  }

  if (temp >= 128) {
    // Read the sixth through tenth byte.
    for (let i = 0; i < 5 && temp >= 128; i++) {
      temp = self[BYTES][self[CURSOR]++];
      highBits |= (temp & 0x7f) << (i * 7 + 3);
    }
  }

  if (temp < 128) {
    return convert(lowBits >>> 0, highBits >>> 0);
  }

  // If we did not see the terminator, the encoding was invalid.
  fail("Failed to read varint, encoding is invalid.");
  self[ERROR] = true;
  return undefined as unknown as T;
};

/**
 * Reads a 64-bit fixed-width value from the stream and invokes the conversion
 * function with the value in two signed 32 bit integers to produce the result.
 * Since self does not convert the value to a number, no precision is lost.
 */
export const _readSplitFixed64 = <T>(
  self: BinaryDecoder,
  convert: (a: number, b: number) => T,
): T => {
  const bytes = self[BYTES];
  const cursor = self[CURSOR];
  self[CURSOR] += 8;
  let lowBits = 0;
  let highBits = 0;
  for (let i = cursor + 7; i >= cursor; i--) {
    lowBits = (lowBits << 8) | bytes[i];
    highBits = (highBits << 8) | bytes[i + 4];
  }
  return convert(lowBits, highBits);
};

/**
 * Skips over a varint in the block without decoding it.
 */
export const _skipVarint = (self: BinaryDecoder): void => {
  while (self[BYTES][self[CURSOR]] & 0x80) {
    self[CURSOR]++;
  }
  self[CURSOR]++;
};

/**
 * Skips backwards over a varint in the block - to do self correctly, we have
 * to know the value we're skipping backwards over or things are ambiguous.
 */
export const _unskipVarint = (self: BinaryDecoder, value: number) => {
  while (value > 128) {
    self[CURSOR]--;
    value = value >>> 7;
  }
  self[CURSOR]--;
};

/**
 * Reads a 32-bit varint from the binary stream. Due to a quirk of the encoding
 * format and Javascript's handling of bitwise math, self actually works
 * correctly for both signed and unsigned 32-bit varints.
 *
 * This function is called vastly more frequently than any other in
 * BinaryDecoder, so it has been unrolled and tweaked for performance.
 *
 * If there are more than 32 bits of data in the varint, it _must_ be due to
 * sign-extension. If we're in debug mode and the high 32 bits don't match the
 * expected sign extension, self method will throw an error.
 *
 * Decoding varints requires doing some funny base-128 math - for more
 * details on the format, see
 * https://developers.google.com/protocol-buffers/docs/encoding
 *
 */
export const _readUnsignedVarint32 = (self: BinaryDecoder): number => {
  let temp;
  const bytes = self[BYTES];

  temp = bytes[self[CURSOR] + 0];
  let x = temp & 0x7f;
  if (temp < 128) {
    self[CURSOR] += 1;
    assert(self[CURSOR] <= self[END]);
    return x;
  }

  temp = bytes[self[CURSOR] + 1];
  x |= (temp & 0x7f) << 7;
  if (temp < 128) {
    self[CURSOR] += 2;
    assert(self[CURSOR] <= self[END]);
    return x;
  }

  temp = bytes[self[CURSOR] + 2];
  x |= (temp & 0x7f) << 14;
  if (temp < 128) {
    self[CURSOR] += 3;
    assert(self[CURSOR] <= self[END]);
    return x;
  }

  temp = bytes[self[CURSOR] + 3];
  x |= (temp & 0x7f) << 21;
  if (temp < 128) {
    self[CURSOR] += 4;
    assert(self[CURSOR] <= self[END]);
    return x;
  }

  temp = bytes[self[CURSOR] + 4];
  x |= (temp & 0x0f) << 28;
  if (temp < 128) {
    // We're reading the high bits of an unsigned varint. The byte we just read
    // also contains bits 33 through 35, which we're going to discard.
    self[CURSOR] += 5;
    assert(self[CURSOR] <= self[END]);
    return x >>> 0;
  }

  // If we get here, we need to truncate coming bytes. However we need to make
  // sure cursor place is correct.
  self[CURSOR] += 5;
  if (
    bytes[self[CURSOR]++] >= 128 &&
    bytes[self[CURSOR]++] >= 128 &&
    bytes[self[CURSOR]++] >= 128 &&
    bytes[self[CURSOR]++] >= 128 &&
    bytes[self[CURSOR]++] >= 128
  ) {
    // If we get here, the varint is too long.
    assert(false);
  }

  assert(self[CURSOR] <= self[END]);
  return x;
};

/**
 * The _readUnsignedVarint32 above deals with signed 32-bit varints correctly,
 * so self is just an alias.
 */
export const _readSignedVarint32 = (self: BinaryDecoder): number => {
  return _readUnsignedVarint32(self);
};

/**
 * Reads a 32-bit unsigned variant and returns its value as a string.
 */
export const _readUnsignedVarint32String = (self: BinaryDecoder): string => {
  // 32-bit integers fit in JavaScript numbers without loss of precision, so
  // string variants of 32-bit varint readers can simply delegate then convert
  // to string.
  const value = _readUnsignedVarint32(self);
  return value.toString();
};

/**
 * Reads a 32-bit signed variant and returns its value as a string.
 */
export const _readSignedVarint32String = (self: BinaryDecoder): string => {
  // 32-bit integers fit in JavaScript numbers without loss of precision, so
  // string variants of 32-bit varint readers can simply delegate then convert
  // to string.
  const value = _readSignedVarint32(self);
  return value.toString();
};

/**
 * Reads a signed, zigzag-encoded 32-bit varint from the binary stream.
 *
 * Zigzag encoding is a modification of varint encoding that reduces the
 * storage overhead for small negative integers - for more details on the
 * format, see https://developers.google.com/protocol-buffers/docs/encoding
 */
export const _readZigzagVarint32 = (self: BinaryDecoder): number => {
  const result = _readUnsignedVarint32(self);
  return (result >>> 1) ^ -(result & 1);
};

/**
 * Reads an unsigned 64-bit varint from the binary stream. Note that since
 * Javascript represents all numbers as double-precision floats, there will be
 * precision lost if the absolute value of the varint is larger than 2^53.
 */
export const _readUnsignedVarint64 = (self: BinaryDecoder): number => {
  return _readSplitVarint64(self, joinUint64);
};

/**
 * Reads an unsigned 64-bit varint from the binary stream and returns the value
 * as a decimal string.
 */
export const _readUnsignedVarint64String = (self: BinaryDecoder): string => {
  return _readSplitVarint64(self, joinUnsignedDecimalString);
};

/**
 * Reads a signed 64-bit varint from the binary stream. Note that since
 * Javascript represents all numbers as double-precision floats, there will be
 * precision lost if the absolute value of the varint is larger than 2^53.
 */
export const _readSignedVarint64 = (self: BinaryDecoder): number => {
  return _readSplitVarint64(self, joinInt64);
};

/**
 * Reads an signed 64-bit varint from the binary stream and returns the value
 * as a decimal string.
 */
export const _readSignedVarint64String = (self: BinaryDecoder): string => {
  return _readSplitVarint64(self, joinSignedDecimalString);
};

/**
 * Reads a signed, zigzag-encoded 64-bit varint from the binary stream. Note
 * that since Javascript represents all numbers as double-precision floats,
 * there will be precision lost if the absolute value of the varint is larger
 * than 2^53.
 *
 * Zigzag encoding is a modification of varint encoding that reduces the
 * storage overhead for small negative integers - for more details on the
 * format, see https://developers.google.com/protocol-buffers/docs/encoding
 */
export const _readZigzagVarint64 = (self: BinaryDecoder): number => {
  return _readSplitVarint64(self, joinZigzag64);
};
/**
 * Reads a signed zigzag encoded varint from the binary stream and invokes
 * the conversion function with the value in two signed 32 bit integers to
 * produce the result. Since self does not convert the value to a number, no
 * precision is lost.
 *
 * It's possible for an unsigned varint to be incorrectly encoded - more than
 * 64 bits' worth of data could be present. If self happens, self method will
 * throw an error.
 *
 * Zigzag encoding is a modification of varint encoding that reduces the
 * storage overhead for small negative integers - for more details on the
 * format, see https://developers.google.com/protocol-buffers/docs/encoding
 *     the result value, takes parameters (lowBits, highBits).
 */
export const readSplitZigzagVarint64 = <T>(
  self: BinaryDecoder,
  convert: (bitsLow: number, bitsHigh: number) => T,
): T => {
  return _readSplitVarint64(self, (low, high) =>
    fromZigzag64(low, high, convert),
  );
};

/**
 * Reads a signed, zigzag-encoded 64-bit varint from the binary stream
 * losslessly and returns it as an 8-character Unicode string for use as a hash
 * table key.
 *
 * Zigzag encoding is a modification of varint encoding that reduces the
 * storage overhead for small negative integers - for more details on the
 * format, see https://developers.google.com/protocol-buffers/docs/encoding
 */
export const _readZigzagVarintHash64 = (self: BinaryDecoder): string => {
  return readSplitZigzagVarint64(self, joinHash64);
};

/**
 * Reads a signed, zigzag-encoded 64-bit varint from the binary stream and
 * returns its value as a string.
 *
 * Zigzag encoding is a modification of varint encoding that reduces the
 * storage overhead for small negative integers - for more details on the
 * format, see https://developers.google.com/protocol-buffers/docs/encoding
 */
export const _readZigzagVarint64String = (self: BinaryDecoder): string => {
  return readSplitZigzagVarint64(self, joinSignedDecimalString);
};

/**
 * Reads a raw unsigned 8-bit integer from the binary stream.
 */
export const readUint8 = (self: BinaryDecoder): number => {
  const a = self[BYTES][self[CURSOR] + 0];
  self[CURSOR] += 1;
  assert(self[CURSOR] <= self[END]);
  return a;
};

/**
 * Reads a raw unsigned 16-bit integer from the binary stream.
 */
export const readUint16 = (self: BinaryDecoder): number => {
  const a = self[BYTES][self[CURSOR] + 0];
  const b = self[BYTES][self[CURSOR] + 1];
  self[CURSOR] += 2;
  assert(self[CURSOR] <= self[END]);
  return (a << 0) | (b << 8);
};

/**
 * Reads a raw unsigned 32-bit integer from the binary stream.
 */
export const _readUint32 = (self: BinaryDecoder): number => {
  const a = self[BYTES][self[CURSOR] + 0];
  const b = self[BYTES][self[CURSOR] + 1];
  const c = self[BYTES][self[CURSOR] + 2];
  const d = self[BYTES][self[CURSOR] + 3];
  self[CURSOR] += 4;
  assert(self[CURSOR] <= self[END]);
  return ((a << 0) | (b << 8) | (c << 16) | (d << 24)) >>> 0;
};

/**
 * Reads a raw unsigned 64-bit integer from the binary stream. Note that since
 * Javascript represents all numbers as double-precision floats, there will be
 * precision lost if the absolute value of the integer is larger than 2^53.
 */
export const _readUint64 = (self: BinaryDecoder): number => {
  const bitsLow = _readUint32(self);
  const bitsHigh = _readUint32(self);
  return joinUint64(bitsLow, bitsHigh);
};

/**
 * Reads a raw unsigned 64-bit integer from the binary stream. Note that since
 * Javascript represents all numbers as double-precision floats, there will be
 * precision lost if the absolute value of the integer is larger than 2^53.
 */
export const _readUint64String = (self: BinaryDecoder): string => {
  const bitsLow = _readUint32(self);
  const bitsHigh = _readUint32(self);
  return joinUnsignedDecimalString(bitsLow, bitsHigh);
};

/**
 * Reads a raw signed 8-bit integer from the binary stream.
 */
export const readInt8 = (self: BinaryDecoder): number => {
  const a = self[BYTES][self[CURSOR] + 0];
  self[CURSOR] += 1;
  assert(self[CURSOR] <= self[END]);
  return (a << 24) >> 24;
};

/**
 * Reads a raw signed 16-bit integer from the binary stream.
 */
export const readInt16 = (self: BinaryDecoder): number => {
  const a = self[BYTES][self[CURSOR] + 0];
  const b = self[BYTES][self[CURSOR] + 1];
  self[CURSOR] += 2;
  assert(self[CURSOR] <= self[END]);
  return (((a << 0) | (b << 8)) << 16) >> 16;
};

/**
 * Reads a raw signed 32-bit integer from the binary stream.
 */
export const _readInt32 = (self: BinaryDecoder): number => {
  const a = self[BYTES][self[CURSOR] + 0];
  const b = self[BYTES][self[CURSOR] + 1];
  const c = self[BYTES][self[CURSOR] + 2];
  const d = self[BYTES][self[CURSOR] + 3];
  self[CURSOR] += 4;
  assert(self[CURSOR] <= self[END]);
  return (a << 0) | (b << 8) | (c << 16) | (d << 24);
};

/**
 * Reads a raw signed 64-bit integer from the binary stream. Note that since
 * Javascript represents all numbers as double-precision floats, there will be
 * precision lost if the absolute value of the integer is larger than 2^53.
 */
export const _readInt64 = (self: BinaryDecoder): number => {
  const bitsLow = _readUint32(self);
  const bitsHigh = _readUint32(self);
  return joinInt64(bitsLow, bitsHigh);
};

/**
 * Reads a raw signed 64-bit integer from the binary stream and returns it as a
 * string.
 */
export const _readInt64String = (self: BinaryDecoder): string => {
  const bitsLow = _readUint32(self);
  const bitsHigh = _readUint32(self);
  return joinSignedDecimalString(bitsLow, bitsHigh);
};

/**
 * Reads a 32-bit floating-point number from the binary stream, using the
 * temporary buffer to realign the data.
 */
export const _readFloat = (self: BinaryDecoder): number => {
  const bitsLow = _readUint32(self);
  return joinFloat32(bitsLow);
};

/**
 * Reads a 64-bit floating-point number from the binary stream, using the
 * temporary buffer to realign the data.
 */
export const _readDouble = (self: BinaryDecoder): number => {
  const bitsLow = _readUint32(self);
  const bitsHigh = _readUint32(self);
  return joinFloat64(bitsLow, bitsHigh);
};

/**
 * Reads a boolean value from the binary stream.
 */
export const _readBool = (self: BinaryDecoder): boolean => {
  return !!self[BYTES][self[CURSOR]++];
};

/**
 * Reads an enum value from the binary stream, which are always encoded as
 * signed varints.
 */
export const _readEnum = (self: BinaryDecoder): number => {
  return _readSignedVarint32(self);
};

/**
 * Reads and parses a UTF-8 encoded unicode string from the stream.
 */
export const _readString = (self: BinaryDecoder, length: number): string => {
  return byteArrayToString(_readBytes(self, length));
};

/**
 * Reads and parses a UTF-8 encoded unicode string (with length prefix) from
 * the stream.
 */
export const readStringWithLength = (self: BinaryDecoder): string => {
  const length = _readUnsignedVarint32(self);
  return _readString(self, length);
};

/**
 * Reads a block of raw bytes from the binary stream.
 */
export const _readBytes = (self: BinaryDecoder, length: number): Uint8Array => {
  if (length < 0 || self[CURSOR] + length > self[BYTES].length) {
    self[ERROR] = true;
    fail("invalid byte length");
    return new Uint8Array(0);
  }

  const result = self[BYTES].subarray(self[CURSOR], self[CURSOR] + length);

  self[CURSOR] += length;
  assert(self[CURSOR] <= self[END]);
  return result;
};

/**
 * Reads a 64-bit varint from the stream and returns it as an 8-character
 * Unicode string for use as a hash table key.
 */
export const _readVarintHash64 = (self: BinaryDecoder): string => {
  return _readSplitVarint64(self, joinHash64);
};

/**
 * Reads a 64-bit fixed-width value from the stream and returns it as an
 * 8-character Unicode string for use as a hash table key.
 */
export const _readFixedHash64 = (self: BinaryDecoder): string => {
  const bytes = self[BYTES];
  const cursor = self[CURSOR];

  const a = bytes[cursor + 0];
  const b = bytes[cursor + 1];
  const c = bytes[cursor + 2];
  const d = bytes[cursor + 3];
  const e = bytes[cursor + 4];
  const f = bytes[cursor + 5];
  const g = bytes[cursor + 6];
  const h = bytes[cursor + 7];

  self[CURSOR] += 8;

  return String.fromCharCode(a, b, c, d, e, f, g, h);
};
