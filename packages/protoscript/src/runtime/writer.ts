/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ByteSource,
  byteSourceToUint8Array,
  decimalStringToHash64,
  toZigzag64,
} from "./utils.js";
import { assert, fail } from "./goog/asserts.js";
import {
  _end,
  _length,
  _writeBool,
  _writeDouble,
  _writeEnum,
  _writeFixedHash64,
  _writeFloat,
  _writeInt32,
  _writeInt64,
  _writeInt64String,
  _writeSignedVarint32,
  _writeSignedVarint64,
  _writeSplitFixed64,
  _writeSplitVarint64,
  _writeString,
  _writeUint32,
  _writeUint64,
  _writeUnsignedVarint32,
  _writeUnsignedVarint64,
  _writeVarintHash64,
  _writeZigzagVarint32,
  _writeZigzagVarint64,
  _writeZigzagVarint64String,
  _writeZigzagVarintHash64,
} from "./encoder.js";
import {
  WIRE_TYPE_VARINT,
  WIRE_TYPE_FIXED64,
  WIRE_TYPE_DELIMITED,
  WIRE_TYPE_START_GROUP,
  WIRE_TYPE_END_GROUP,
  WIRE_TYPE_FIXED32,
  TWO_TO_31,
  TWO_TO_32,
  TWO_TO_63,
  TWO_TO_64,
  FIELD_TYPE_DOUBLE,
  FIELD_TYPE_FLOAT,
  FIELD_TYPE_INT64,
  FIELD_TYPE_UINT64,
  FIELD_TYPE_INT32,
  FIELD_TYPE_FIXED64,
  FIELD_TYPE_FIXED32,
  FIELD_TYPE_BOOL,
  FIELD_TYPE_STRING,
  FIELD_TYPE_GROUP,
  FIELD_TYPE_MESSAGE,
  FIELD_TYPE_BYTES,
  FIELD_TYPE_UINT32,
  FIELD_TYPE_ENUM,
  FIELD_TYPE_SFIXED32,
  FIELD_TYPE_SFIXED64,
  FIELD_TYPE_SINT32,
  FIELD_TYPE_SINT64,
  FIELD_TYPE_FHASH64,
  FIELD_TYPE_VHASH64,
} from "./constants.js";
import { UInt64, Int64 } from "./arith.js";

type BinaryEncoder = Array<number>;

const BLOCKS = 0;
const TOTAL_LENGTH = 1;
const ENCODER = 2;

type BinaryWriter = [
  Array<Uint8Array | number[]>, // blocks
  number, // totalLength
  BinaryEncoder, // encoder
];

export const binaryWriter = (): BinaryWriter => [[], 0, []];

// export class BinaryWriter {
//   blocks_: Array<Uint8Array | number[]>;
//   totalLength_: number;
//   encoder_: BinaryEncoder;
//   constructor() {
//     /**
//      * Blocks of serialized data that will be concatenated once all messages have
//      * been written.
//      */
//     this.blocks_ = [];
//
//     /**
//      * Total number of bytes in the blocks_ array. Does _not_ include bytes in
//      * the encoder below.
//      */
//     this.totalLength_ = 0;
//
//     /**
//      * Binary encoder holding pieces of a message that we're still serializing.
//      * When we get to a stopping point (either the start of a new submessage, or
//      * when we need to append a raw Uint8Array), the encoder's buffer will be
//      * added to the block array above and the encoder will be reset.
//      */
//     this.encoder_ = [];
//   }
// }

/**
 * BinaryWriter implements encoders for all the wires specified in
 * https://developers.google.com/protocol-buffers/docs/encoding.
 */
/**
 * Converts the encoded data into a Uint8Array.
 */
export const getResultBuffer = (self: BinaryWriter): Uint8Array => {
  const flat = new Uint8Array(self[TOTAL_LENGTH] + _length(self[ENCODER]));

  const blocks = self[BLOCKS];
  const blockCount = blocks.length;
  let offset = 0;

  for (let i = 0; i < blockCount; i++) {
    const block = blocks[i];
    flat.set(block, offset);
    offset += block.length;
  }

  const tail = _end(self[ENCODER]);
  flat.set(tail, offset);
  offset += tail.length;

  // Post condition: `flattened` must have had every byte written.
  assert(offset == flat.length);

  // Replace our block list with the flattened block, which lets GC reclaim
  // the temp blocks sooner.
  self[BLOCKS] = [flat];

  return flat;
};

/**
 * Append a typed array of bytes onto the buffer.
 */
const appendUint8Array_ = (self: BinaryWriter, arr: Uint8Array) => {
  const temp = _end(self[ENCODER]);
  self[BLOCKS].push(temp);
  self[BLOCKS].push(arr);
  self[TOTAL_LENGTH] += temp.length + arr.length;
};

/**
 * Begins a new message by writing the field header and returning a bookmark
 * which we will use to patch in the message length to in endDelimited_ below.
 */
export const beginDelimited_ = (
  self: BinaryWriter,
  field: number,
): Array<number> => {
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  const bookmark = _end(self[ENCODER]);
  self[BLOCKS].push(bookmark);
  self[TOTAL_LENGTH] += bookmark.length;
  bookmark.push(self[TOTAL_LENGTH]);
  return bookmark;
};

/**
 * Ends a message by encoding the _change_ in length of the buffer to the
 * parent block and adds the number of bytes needed to encode that length to
 * the total byte length.
 */
export const endDelimited_ = (self: BinaryWriter, bookmark: Array<number>) => {
  const oldLength = bookmark.pop() ?? 0;
  let messageLength = self[TOTAL_LENGTH] + _length(self[ENCODER]) - oldLength;
  assert(messageLength >= 0);

  while (messageLength > 127) {
    bookmark.push((messageLength & 0x7f) | 0x80);
    messageLength = messageLength >>> 7;
    self[TOTAL_LENGTH]++;
  }

  bookmark.push(messageLength);
  self[TOTAL_LENGTH]++;
};

/**
 * Writes a pre-serialized message to the buffer.
 */
export const writeSerializedMessage = (
  self: BinaryWriter,
  bytes: Uint8Array,
  start: number,
  end: number,
) => {
  appendUint8Array_(self, bytes.subarray(start, end));
};

/**
 * Writes a pre-serialized message to the buffer if the message and endpoints
 * are non-null.
 */
export const maybeWriteSerializedMessage = (
  self: BinaryWriter,
  bytes: Uint8Array | null,
  start: number | null,
  end: number | null,
) => {
  if (bytes != null && start != null && end != null) {
    writeSerializedMessage(self, bytes, start, end);
  }
};

/**
 * Resets the writer, throwing away any accumulated buffers.
 */
export const reset = (self: BinaryWriter) => {
  self[BLOCKS] = [];
  _end(self[ENCODER]);
  self[TOTAL_LENGTH] = 0;
};

/**
 * Encodes a (field number, wire) tuple into a wire-format field header
 * and stores it in the buffer as a varint.
 */
const writeFieldHeader = (
  self: BinaryWriter,
  field: number,
  wireType: number,
) => {
  assert(field >= 1 && field == Math.floor(field));
  const x = field * 8 + wireType;
  _writeUnsignedVarint32(self[ENCODER], x);
};

/**
 * Writes a field of any valid scalar type to the binary stream.
 */
export const writeAny = (
  self: BinaryWriter,
  fieldType: number,
  field: number,
  value: any,
): void => {
  if (fieldType == FIELD_TYPE_DOUBLE) {
    writeDouble(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_FLOAT) {
    writeFloat(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_INT64) {
    writeInt64(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_UINT64) {
    writeUint64(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_INT32) {
    writeInt32(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_FIXED64) {
    writeFixed64(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_FIXED32) {
    writeFixed32(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_BOOL) {
    writeBool(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_STRING) {
    writeString(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_GROUP) {
    fail("Group field type not supported in writeAny()");
    return;
  }
  if (fieldType == FIELD_TYPE_MESSAGE) {
    fail("Message field type not supported in writeAny()");
    return;
  }
  if (fieldType == FIELD_TYPE_BYTES) {
    writeBytes(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_UINT32) {
    writeUint32(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_ENUM) {
    writeEnum(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_SFIXED32) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeSfixed32(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_SFIXED64) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeSfixed64(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_SINT32) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeSint32(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_SINT64) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeSint64(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_FHASH64) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeFixedHash64(self, field, value);
    return;
  }
  if (fieldType == FIELD_TYPE_VHASH64) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    writeVarintHash64(self, field, value);
    return;
  }
  fail("Invalid field type in writeAny()");
  return;
};

/**
 * Writes a varint field to the buffer without range checking.
 */
export const writeUnsignedVarint32_ = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeUnsignedVarint32(self[ENCODER], value);
};

/**
 * Writes a varint field to the buffer without range checking.
 */
export const writeSignedVarint32_ = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeSignedVarint32(self[ENCODER], value);
};

/**
 * Writes a varint field to the buffer without range checking.
 */
export const writeUnsignedVarint64_ = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeUnsignedVarint64(self[ENCODER], value);
};

/**
 * Writes a varint field to the buffer without range checking.
 */
export const writeSignedVarint64_ = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeSignedVarint64(self[ENCODER], value);
};

/**
 * Writes a zigzag varint field to the buffer without range checking.
 */
export const writeZigzagVarint32_ = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeZigzagVarint32(self[ENCODER], value);
};

/**
 * Writes a zigzag varint field to the buffer without range checking.
 */
export const writeZigzagVarint64_ = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeZigzagVarint64(self[ENCODER], value);
};

/**
 * Writes a zigzag varint field to the buffer without range checking.
 */
export const writeZigzagVarint64String_ = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeZigzagVarint64String(self[ENCODER], value);
};

/**
 * Writes a zigzag varint field to the buffer without range checking.
 */
export const writeZigzagVarintHash64_ = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeZigzagVarintHash64(self[ENCODER], value);
};

/**
 * Writes an int32 field to the buffer. Numbers outside the range [-2^31,2^31)
 * will be truncated.
 */
export const writeInt32 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_31 && value < TWO_TO_31);
  writeSignedVarint32_(self, field, value);
};

/**
 * Writes an int32 field represented as a string to the buffer. Numbers outside
 * the range [-2^31,2^31) will be truncated.
 */
export const writeInt32String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const intValue = /** {number} */ parseInt(value, 10);
  assert(intValue >= -TWO_TO_31 && intValue < TWO_TO_31);
  writeSignedVarint32_(self, field, intValue);
};

/**
 * Writes an int64 field to the buffer. Numbers outside the range [-2^63,2^63)
 * will be truncated.
 */
export const writeInt64 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_63 && value < TWO_TO_63);
  writeSignedVarint64_(self, field, value);
};

/**
 * Writes a int64 field (with value as a string) to the buffer.
 */
export const writeInt64String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const num = Int64.fromString(value);
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeSplitVarint64(self[ENCODER], num.lo, num.hi);
};

/**
 * Writes a uint32 field to the buffer. Numbers outside the range [0,2^32)
 * will be truncated.
 */
export const writeUint32 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= 0 && value < TWO_TO_32);
  writeUnsignedVarint32_(self, field, value);
};

/**
 * Writes a uint32 field represented as a string to the buffer. Numbers outside
 * the range [0,2^32) will be truncated.
 */
export const writeUint32String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const intValue = /** {number} */ parseInt(value, 10);
  assert(intValue >= 0 && intValue < TWO_TO_32);
  writeUnsignedVarint32_(self, field, intValue);
};

/**
 * Writes a uint64 field to the buffer. Numbers outside the range [0,2^64)
 * will be truncated.
 */
export const writeUint64 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= 0 && value < TWO_TO_64);
  writeUnsignedVarint64_(self, field, value);
};

/**
 * Writes a uint64 field (with value as a string) to the buffer.
 */
export const writeUint64String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const num = UInt64.fromString(value);
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeSplitVarint64(self[ENCODER], num.lo, num.hi);
};

/**
 * Writes an sint32 field to the buffer. Numbers outside the range [-2^31,2^31)
 * will be truncated.
 */
export const writeSint32 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_31 && value < TWO_TO_31);
  writeZigzagVarint32_(self, field, value);
};

/**
 * Writes an sint64 field to the buffer. Numbers outside the range [-2^63,2^63)
 * will be truncated.
 */
export const writeSint64 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_63 && value < TWO_TO_63);
  writeZigzagVarint64_(self, field, value);
};

/**
 * Writes an sint64 field to the buffer from a hash64 encoded value. Numbers
 * outside the range [-2^63,2^63) will be truncated.
 */
export const writeSintHash64 = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  writeZigzagVarintHash64_(self, field, value);
};

/**
 * Writes an sint64 field to the buffer. Numbers outside the range [-2^63,2^63)
 * will be truncated.
 */
export const writeSint64String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  writeZigzagVarint64String_(self, field, value);
};

/**
 * Writes a fixed32 field to the buffer. Numbers outside the range [0,2^32)
 * will be truncated.
 */
export const writeFixed32 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= 0 && value < TWO_TO_32);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED32);
  _writeUint32(self[ENCODER], value);
};

/**
 * Writes a fixed64 field to the buffer. Numbers outside the range [0,2^64)
 * will be truncated.
 */
export const writeFixed64 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= 0 && value < TWO_TO_64);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeUint64(self[ENCODER], value);
};

/**
 * Writes a fixed64 field (with value as a string) to the buffer.
 */
export const writeFixed64String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const num = UInt64.fromString(value);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeSplitFixed64(self[ENCODER], num.lo, num.hi);
};

/**
 * Writes a sfixed32 field to the buffer. Numbers outside the range
 * [-2^31,2^31) will be truncated.
 */
export const writeSfixed32 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_31 && value < TWO_TO_31);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED32);
  _writeInt32(self[ENCODER], value);
};

/**
 * Writes a sfixed64 field to the buffer. Numbers outside the range
 * [-2^63,2^63) will be truncated.
 */
export const writeSfixed64 = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_63 && value < TWO_TO_63);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeInt64(self[ENCODER], value);
};

/**
 * Writes a sfixed64 string field to the buffer. Numbers outside the range
 * [-2^63,2^63) will be truncated.
 */
export const writeSfixed64String = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const num = Int64.fromString(value);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeSplitFixed64(self[ENCODER], num.lo, num.hi);
};

/**
 * Writes a single-precision floating point field to the buffer. Numbers
 * requiring more than 32 bits of precision will be truncated.
 */
export const writeFloat = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_FIXED32);
  _writeFloat(self[ENCODER], value);
};

/**
 * Writes a double-precision floating point field to the buffer. As this is the
 * native format used by JavaScript, no precision will be lost.
 */
export const writeDouble = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeDouble(self[ENCODER], value);
};

/**
 * Writes a boolean field to the buffer. We allow numbers as input
 * because the JSPB code generator uses 0/1 instead of true/false to save space
 * in the string representation of the proto.
 */
export const writeBool = (
  self: BinaryWriter,
  field: number,
  value: boolean | number | undefined,
) => {
  if (!value) return;
  assert(typeof value === "boolean" || typeof value === "number");
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeBool(self[ENCODER], value);
};

/**
 * Writes an enum field to the buffer.
 */
export const writeEnum = (
  self: BinaryWriter,
  field: number,
  value: number | null,
) => {
  if (!value) return;
  assert(value >= -TWO_TO_31 && value < TWO_TO_31);
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeSignedVarint32(self[ENCODER], value);
};

/**
 * Writes a string field to the buffer.
 */
export const writeString = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  const bookmark = beginDelimited_(self, field);
  _writeString(self[ENCODER], value);
  endDelimited_(self, bookmark);
};

/**
 * Writes an arbitrary byte field to the buffer. Note - to match the behavior
 * of the C++ implementation, empty byte arrays _are_ serialized.
 */
export const writeBytes = (
  self: BinaryWriter,
  field: number,
  value: ByteSource | null,
) => {
  if (!value) return;
  const bytes = byteSourceToUint8Array(value),
    length = bytes.length;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], length);
  appendUint8Array_(self, bytes);
};

/**
 * Writes a message to the buffer.
 */
export const writeMessage = <MessageType>(
  self: BinaryWriter,
  field: number,
  value: MessageType | null,
  writerCallback: (arg0: MessageType, arg1: BinaryWriter) => void,
) => {
  if (!value) return;
  const bookmark = beginDelimited_(self, field);
  writerCallback(value, self);
  endDelimited_(self, bookmark);
};

/**
 * Writes a message set extension to the buffer.
 */
export const writeMessageSet = <MessageType>(
  self: BinaryWriter,
  field: number,
  value: MessageType | null,
  writerCallback: (arg0: MessageType, arg1: BinaryWriter) => void,
) => {
  if (!value) return;
  // The wire format for a message set is defined by
  // google3/net/proto/message_set.proto
  writeFieldHeader(self, 1, WIRE_TYPE_START_GROUP);
  writeFieldHeader(self, 2, WIRE_TYPE_VARINT);
  _writeSignedVarint32(self[ENCODER], field);
  const bookmark = beginDelimited_(self, 3);
  writerCallback(value, self);
  endDelimited_(self, bookmark);
  writeFieldHeader(self, 1, WIRE_TYPE_END_GROUP);
};

/**
 * Writes a group message to the buffer.
 */
export const writeGroup = <MessageType>(
  self: BinaryWriter,
  field: number,
  value: MessageType | null,
  writerCallback: (arg0: MessageType, arg1: BinaryWriter) => void,
) => {
  if (!value) return;
  writeFieldHeader(self, field, WIRE_TYPE_START_GROUP);
  writerCallback(value, self);
  writeFieldHeader(self, field, WIRE_TYPE_END_GROUP);
};

/**
 * Writes a 64-bit hash string field (8 characters @ 8 bits of data each) to
 * the buffer.
 */
export const writeFixedHash64 = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  assert(value.length == 8);
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeFixedHash64(self[ENCODER], value);
};

/**
 * Writes a 64-bit hash string field (8 characters @ 8 bits of data each) to
 * the buffer.
 */
export const writeVarintHash64 = (
  self: BinaryWriter,
  field: number,
  value: string | null,
) => {
  if (!value) return;
  assert(value.length == 8);
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeVarintHash64(self[ENCODER], value);
};

/**
 * Writes a 64-bit field to the buffer as a fixed64.
 */
export const writeSplitFixed64 = (
  self: BinaryWriter,
  field: number,
  lowBits: number,
  highBits: number,
) => {
  writeFieldHeader(self, field, WIRE_TYPE_FIXED64);
  _writeSplitFixed64(self[ENCODER], lowBits, highBits);
};

/**
 * Writes a 64-bit field to the buffer as a varint.
 */
export const writeSplitVarint64 = (
  self: BinaryWriter,
  field: number,
  lowBits: number,
  highBits: number,
) => {
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  _writeSplitVarint64(self[ENCODER], lowBits, highBits);
};

/**
 * Writes a 64-bit field to the buffer as a zigzag encoded varint.
 */
export const writeSplitZigzagVarint64 = (
  self: BinaryWriter,
  field: number,
  lowBits: number,
  highBits: number,
) => {
  writeFieldHeader(self, field, WIRE_TYPE_VARINT);
  const encoder = self[ENCODER];
  toZigzag64(lowBits, highBits, function (lowBits, highBits) {
    _writeSplitVarint64(encoder, lowBits >>> 0, highBits >>> 0);
  });
};

/**
 * Writes an array of numbers to the buffer as a repeated 32-bit int field.
 */
export const writeRepeatedInt32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSignedVarint32_(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers formatted as strings to the buffer as a repeated
 * 32-bit int field.
 */
export const writeRepeatedInt32String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeInt32String(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated 64-bit int field.
 */
export const writeRepeatedInt64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSignedVarint64_(self, field, value[i]);
  }
};

/**
 * Writes an array of 64-bit values to the buffer as a fixed64.
 */
export const writeRepeatedSplitFixed64 = <T>(
  self: BinaryWriter,
  field: number,
  value: Array<T> | null,
  lo: (arg0: T) => number,
  hi: (arg0: T) => number,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSplitFixed64(self, field, lo(value[i]), hi(value[i]));
  }
};

/**
 * Writes an array of 64-bit values to the buffer as a varint.
 */
export const writeRepeatedSplitVarint64 = <T>(
  self: BinaryWriter,
  field: number,
  value: Array<T> | null,
  lo: (arg0: T) => number,
  hi: (arg0: T) => number,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSplitVarint64(self, field, lo(value[i]), hi(value[i]));
  }
};

/**
 * Writes an array of 64-bit values to the buffer as a zigzag varint.
 */
export const writeRepeatedSplitZigzagVarint64 = <T>(
  self: BinaryWriter,
  field: number,
  value: Array<T> | null,
  lo: (arg0: T) => number,
  hi: (arg0: T) => number,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSplitZigzagVarint64(self, field, lo(value[i]), hi(value[i]));
  }
};

/**
 * Writes an array of numbers formatted as strings to the buffer as a repeated
 * 64-bit int field.
 */
export const writeRepeatedInt64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeInt64String(self, field, value[i]);
  }
};

/**
 * Writes an array numbers to the buffer as a repeated unsigned 32-bit int
 *     field.
 */
export const writeRepeatedUint32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeUnsignedVarint32_(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers formatted as strings to the buffer as a repeated
 * unsigned 32-bit int field.
 */
export const writeRepeatedUint32String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeUint32String(self, field, value[i]);
  }
};

/**
 * Writes an array numbers to the buffer as a repeated unsigned 64-bit int
 *     field.
 */
export const writeRepeatedUint64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeUnsignedVarint64_(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers formatted as strings to the buffer as a repeated
 * unsigned 64-bit int field.
 */
export const writeRepeatedUint64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeUint64String(self, field, value[i]);
  }
};

/**
 * Writes an array numbers to the buffer as a repeated signed 32-bit int field.
 */
export const writeRepeatedSint32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeZigzagVarint32_(self, field, value[i]);
  }
};

/**
 * Writes an array numbers to the buffer as a repeated signed 64-bit int field.
 */
export const writeRepeatedSint64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeZigzagVarint64_(self, field, value[i]);
  }
};

/**
 * Writes an array numbers to the buffer as a repeated signed 64-bit int field.
 */
export const writeRepeatedSint64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeZigzagVarint64String_(self, field, value[i]);
  }
};

/**
 * Writes an array of hash64 strings to the buffer as a repeated signed 64-bit
 * int field.
 */
export const writeRepeatedSintHash64 = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeZigzagVarintHash64_(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated fixed32 field. This
 * works for both signed and unsigned fixed32s.
 */
export const writeRepeatedFixed32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeFixed32(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated fixed64 field. This
 * works for both signed and unsigned fixed64s.
 */
export const writeRepeatedFixed64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeFixed64(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated fixed64 field. This
 * works for both signed and unsigned fixed64s.
 */
export const writeRepeatedFixed64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeFixed64String(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated sfixed32 field.
 */
export const writeRepeatedSfixed32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSfixed32(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated sfixed64 field.
 */
export const writeRepeatedSfixed64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSfixed64(self, field, value[i]);
  }
};

/**
 * Writes an array of decimal strings to the buffer as a repeated sfixed64
 * field.
 */
export const writeRepeatedSfixed64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeSfixed64String(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated float field.
 */
export const writeRepeatedFloat = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeFloat(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a repeated double field.
 */
export const writeRepeatedDouble = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeDouble(self, field, value[i]);
  }
};

/**
 * Writes an array of booleans to the buffer as a repeated bool field.
 */
export const writeRepeatedBool = (
  self: BinaryWriter,
  field: number,
  value: Array<boolean> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeBool(self, field, value[i]);
  }
};

/**
 * Writes an array of enums to the buffer as a repeated enum field.
 */
export const writeRepeatedEnum = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeEnum(self, field, value[i]);
  }
};

/**
 * Writes an array of strings to the buffer as a repeated string field.
 */
export const writeRepeatedString = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeString(self, field, value[i]);
  }
};

/**
 * Writes an array of arbitrary byte fields to the buffer.
 */
export const writeRepeatedBytes = (
  self: BinaryWriter,
  field: number,
  value: Array<ByteSource> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeBytes(self, field, value[i]);
  }
};
export type WriterFunc<MessageType> = (
  self: BinaryWriter,
  field: number,
  value: Array<MessageType> | null,
) => void;

/**
 * Writes an array of messages to the buffer.
 */
export const writeRepeatedMessage =
  <MessageType>(
    writerCallback: (arg0: MessageType, arg1: BinaryWriter) => any,
  ): WriterFunc<MessageType> =>
  (self: BinaryWriter, field: number, value: Array<MessageType> | null) => {
    if (!value?.length) return;
    for (let i = 0; i < value.length; i++) {
      const bookmark = beginDelimited_(self, field);
      writerCallback(value[i], self);
      endDelimited_(self, bookmark);
    }
  };

/**
 * Writes an array of group messages to the buffer.
 * @template MessageType
 */
export const writeRepeatedGroup = <MessageType>(
  self: BinaryWriter,
  field: number,
  value: Array<MessageType> | null,
  writerCallback: (arg0: MessageType, arg1: BinaryWriter) => any,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeFieldHeader(self, field, WIRE_TYPE_START_GROUP);
    writerCallback(value[i], self);
    writeFieldHeader(self, field, WIRE_TYPE_END_GROUP);
  }
};

/**
 * Writes a 64-bit hash string field (8 characters @ 8 bits of data each) to
 * the buffer.
 */
export const writeRepeatedFixedHash64 = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeFixedHash64(self, field, value[i]);
  }
};

/**
 * Writes a repeated 64-bit hash string field (8 characters @ 8 bits of data
 * each) to the buffer.
 */
export const writeRepeatedVarintHash64 = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value) return;
  for (let i = 0; i < value.length; i++) {
    writeVarintHash64(self, field, value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed 32-bit int field.
 */
export const writePackedInt32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeSignedVarint32(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers represented as strings to the buffer as a packed
 * 32-bit int field.
 */
export const writePackedInt32String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeSignedVarint32(self[ENCODER], parseInt(value[i], 10));
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers to the buffer as a packed 64-bit int field.
 */
export const writePackedInt64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field),
    encoder = self[ENCODER];
  for (let i = 0; i < value.length; i++) {
    _writeSignedVarint64(encoder, value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of 64-bit values to the buffer as a fixed64.
 */
export const writePackedSplitFixed64 = <T>(
  self: BinaryWriter,
  field: number,
  value: Array<T> | null,
  lo: (arg0: T) => number,
  hi: (arg0: T) => number,
) => {
  if (!value) return;
  const bookmark = beginDelimited_(self, field),
    encoder = self[ENCODER];
  for (let i = 0; i < value.length; i++) {
    _writeSplitFixed64(encoder, lo(value[i]), hi(value[i]));
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of 64-bit values to the buffer as a varint.
 */
export const writePackedSplitVarint64 = <T>(
  self: BinaryWriter,
  field: number,
  value: Array<T> | null,
  lo: (arg0: T) => number,
  hi: (arg0: T) => number,
) => {
  if (!value) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeSplitVarint64(self[ENCODER], lo(value[i]), hi(value[i]));
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of 64-bit values to the buffer as a zigzag varint.
 */
export const writePackedSplitZigzagVarint64 = <T>(
  self: BinaryWriter,
  field: number,
  value: Array<T> | null,
  lo: (arg0: T) => number,
  hi: (arg0: T) => number,
) => {
  if (!value) return;
  const bookmark = beginDelimited_(self, field);
  const encoder = self[ENCODER];
  for (let i = 0; i < value.length; i++) {
    toZigzag64(lo(value[i]), hi(value[i]), function (bitsLow, bitsHigh) {
      _writeSplitVarint64(encoder, bitsLow >>> 0, bitsHigh >>> 0);
    });
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers represented as strings to the buffer as a packed
 * 64-bit int field.
 */
export const writePackedInt64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field),
    encoder = self[ENCODER];
  for (let i = 0; i < value.length; i++) {
    const num = Int64.fromString(value[i]);
    _writeSplitVarint64(encoder, num.lo, num.hi);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array numbers to the buffer as a packed unsigned 32-bit int field.
 */
export const writePackedUint32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeUnsignedVarint32(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers represented as strings to the buffer as a packed
 * unsigned 32-bit int field.
 */
export const writePackedUint32String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeUnsignedVarint32(self[ENCODER], parseInt(value[i], 10));
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array numbers to the buffer as a packed unsigned 64-bit int field.
 */
export const writePackedUint64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeUnsignedVarint64(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers represented as strings to the buffer as a packed
 * unsigned 64-bit int field.
 */
export const writePackedUint64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    const num = UInt64.fromString(value[i]);
    _writeSplitVarint64(self[ENCODER], num.lo, num.hi);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array numbers to the buffer as a packed signed 32-bit int field.
 */
export const writePackedSint32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeZigzagVarint32(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers to the buffer as a packed signed 64-bit int field.
 */
export const writePackedSint64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeZigzagVarint64(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of decimal strings to the buffer as a packed signed 64-bit
 * int field.
 */
export const writePackedSint64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeZigzagVarintHash64(self[ENCODER], decimalStringToHash64(value[i]));
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of hash 64 strings to the buffer as a packed signed 64-bit
 * int field.
 */
export const writePackedSintHash64 = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeZigzagVarintHash64(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes an array of numbers to the buffer as a packed fixed32 field.
 */
export const writePackedFixed32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 4);
  for (let i = 0; i < value.length; i++) {
    _writeUint32(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed fixed64 field.
 */
export const writePackedFixed64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 8);
  for (let i = 0; i < value.length; i++) {
    _writeUint64(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of numbers represented as strings to the buffer as a packed
 * fixed64 field.
 */
export const writePackedFixed64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 8);
  for (let i = 0; i < value.length; i++) {
    const num = UInt64.fromString(value[i]);
    _writeSplitFixed64(self[ENCODER], num.lo, num.hi);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed sfixed32 field.
 */
export const writePackedSfixed32 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 4);
  for (let i = 0; i < value.length; i++) {
    _writeInt32(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed sfixed64 field.
 */
export const writePackedSfixed64 = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 8);
  for (let i = 0; i < value.length; i++) {
    _writeInt64(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed sfixed64 field.
 */
export const writePackedSfixed64String = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 8);
  for (let i = 0; i < value.length; i++) {
    _writeInt64String(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed float field.
 */
export const writePackedFloat = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 4);
  for (let i = 0; i < value.length; i++) {
    _writeFloat(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of numbers to the buffer as a packed double field.
 */
export const writePackedDouble = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 8);
  for (let i = 0; i < value.length; i++) {
    _writeDouble(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of booleans to the buffer as a packed bool field.
 */
export const writePackedBool = (
  self: BinaryWriter,
  field: number,
  value: Array<boolean> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length);
  for (let i = 0; i < value.length; i++) {
    _writeBool(self[ENCODER], value[i]);
  }
};

/**
 * Writes an array of enums to the buffer as a packed enum field.
 */
export const writePackedEnum = (
  self: BinaryWriter,
  field: number,
  value: Array<number> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeEnum(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};

/**
 * Writes a 64-bit hash string field (8 characters @ 8 bits of data each) to
 * the buffer.
 */
export const writePackedFixedHash64 = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  writeFieldHeader(self, field, WIRE_TYPE_DELIMITED);
  _writeUnsignedVarint32(self[ENCODER], value.length * 8);
  for (let i = 0; i < value.length; i++) {
    _writeFixedHash64(self[ENCODER], value[i]);
  }
};

/**
 * Writes a 64-bit hash string field (8 characters @ 8 bits of data each) to
 * the buffer.
 */
export const writePackedVarintHash64 = (
  self: BinaryWriter,
  field: number,
  value: Array<string> | null,
) => {
  if (!value?.length) return;
  const bookmark = beginDelimited_(self, field);
  for (let i = 0; i < value.length; i++) {
    _writeVarintHash64(self[ENCODER], value[i]);
  }
  endDelimited_(self, bookmark);
};
