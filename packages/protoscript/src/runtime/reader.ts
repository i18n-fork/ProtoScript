/* eslint-disable @typescript-eslint/unbound-method */

import { assert, fail } from "./goog/asserts.js";
import {
  WIRE_TYPE_INVALID,
  WIRE_TYPE_VARINT,
  WIRE_TYPE_FIXED64,
  WIRE_TYPE_DELIMITED,
  WIRE_TYPE_START_GROUP,
  WIRE_TYPE_END_GROUP,
  WIRE_TYPE_FIXED32,
  INVALID_FIELD_NUMBER,
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
  FieldTypeToWireType,
} from "./constants.js";

import type { BinaryDecoder } from "./decoder.js";

import {
  _alloc,
  _clear,
  _advance,
  _atEnd,
  _getBuffer,
  _getCursor,
  _getError,
  _getEnd,
  _readBool,
  _readBytes,
  _readDouble,
  _readEnum,
  _readFixedHash64,
  _readFloat,
  _readInt32,
  _readInt64,
  _readInt64String,
  _readSignedVarint32,
  _readSignedVarint32String,
  _readSignedVarint64,
  _readSignedVarint64String,
  _readSplitFixed64,
  _readSplitVarint64,
  _readString,
  _readUint32,
  _readUint64,
  _readUint64String,
  _readUnsignedVarint32,
  _readUnsignedVarint32String,
  _readUnsignedVarint64,
  _readUnsignedVarint64String,
  _readVarintHash64,
  _readZigzagVarint32,
  _readZigzagVarint64,
  _readZigzagVarint64String,
  _readZigzagVarintHash64,
  // _reset,
  _setCursor,
  _unskipVarint,
  _skipVarint,
  // _setBlock,
  _setEnd,
} from "./decoder.js";
import { ByteSource } from "./utils.js";

const instanceCache_: BinaryReader[] = [];
/**
 * BinaryReader implements the decoders for all the wires specified in
 * https://developers.google.com/protocol-buffers/docs/encoding.
 */

const DECODER = 0,
  FIELD_CURSOR = 1,
  NEXT_FIELD = 2,
  NEXT_WIRE_TYPE = 3,
  ERROR = 4,
  READ_CALLBACKS = 5;

export type BinaryReader = [
  BinaryDecoder, //  decoder_
  number, //  fieldCursor_
  number, //  nextField_
  number, //  nextWireType_
  boolean, //  error_
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Record<string, (reader: BinaryReader) => any>, //  readCallbacks_
];
/**
 * Global pool of BinaryReader instances.
 */

/**
 * Pops an instance off the instance cache, or creates one if the cache is
 * empty.
 */
// static _alloc(
//   opt_bytes?: ByteSource | undefined,
//   opt_start?: number | undefined,
//   opt_length?: number | undefined,
// ): BinaryReader {
//   const newReader = BinaryReader.instanceCache_.pop();
//   if (newReader) {
//     if (opt_bytes) {
//       _setBlock(newReader.decoder_, opt_bytes, opt_start, opt_length);
//     }
//     return newReader;
//   } else {
//     return new BinaryReader(opt_bytes, opt_start, opt_length);
//   }
// }
export const binaryReader = (
  opt_bytes: ByteSource | undefined = undefined,
  opt_start: number | undefined = undefined,
  opt_length: number | undefined = undefined,
): BinaryReader => {
  const decoder = _alloc(opt_bytes, opt_start, opt_length);
  return [
    /**
     * Wire-format decoder.
     */
    decoder,
    /**
     * Cursor immediately before the field tag.
     */
    _getCursor(decoder),
    /**
     * Field number of the next field in the buffer, filled in by nextField().
     */
    INVALID_FIELD_NUMBER,
    /**
     * Wire type of the next proto field in the buffer, filled in by
     * nextField().
     */
    WIRE_TYPE_INVALID,
    /**
     * Set to true if this reader encountered an error due to corrupt data.
     */
    false,
    /**
     * User-defined reader callbacks.
     */
    {},
  ];
};

/**
 * Puts self instance back in the instance cache.
 */
export const free = (self: BinaryReader) => {
  _clear(self[DECODER]);
  self[NEXT_FIELD] = INVALID_FIELD_NUMBER;
  self[NEXT_WIRE_TYPE] = WIRE_TYPE_INVALID;
  self[ERROR] = false;
  self[READ_CALLBACKS] = {};

  if (instanceCache_.length < 100) {
    instanceCache_.push(self);
  }
};

/**
 * Returns the cursor immediately before the current field's tag.
 */
export const getFieldCursor = (self: BinaryReader): number => {
  return self[FIELD_CURSOR];
};

/**
 * Returns the internal read cursor.
 */
export const getCursor = (self: BinaryReader): number => {
  return _getCursor(self[DECODER]);
};

/**
 * Returns the raw buffer.
 */
export const getBuffer = (self: BinaryReader): Uint8Array | undefined => {
  return _getBuffer(self[DECODER]);
};

export const getFieldNumber = (self: BinaryReader): number => {
  return self[NEXT_FIELD];
};

/**
 * The wire of the next field in the stream, or WIRE_TYPE_INVALID if there is no next field.
 */
export const getWireType = (self: BinaryReader): number => {
  return self[NEXT_WIRE_TYPE];
};

/**
 * Whether the current wire is a delimited field. Used to
 * conditionally parse packed repeated fields.
 */
export const isDelimited = (self: BinaryReader): boolean => {
  return self[NEXT_WIRE_TYPE] == WIRE_TYPE_DELIMITED;
};

/**
 * Whether the current wire is an end-group tag. Used as
 * an exit condition in decoder loops in generated code.
 */
export const isEndGroup = (self: BinaryReader): boolean => {
  return self[NEXT_WIRE_TYPE] == WIRE_TYPE_END_GROUP;
};

/**
 * Returns true if self reader hit an error due to corrupt data.
 */
export const getError = (self: BinaryReader): boolean => {
  return self[ERROR] || _getError(self[DECODER]);
};

/**
 * Points self reader at a new block of bytes.
 */
// _setBlock(bytes: Uint8Array, start: number, length: number) {
//   _setBlock(self[DECODER], bytes, start, length);
//   self[NEXT_FIELD] = INVALID_FIELD_NUMBER;
//   self[NEXT_WIRE_TYPE] = WIRE_TYPE_INVALID;
// }

/**
 * Rewinds the stream cursor to the beginning of the buffer and resets all
 * internal state.
 */
// _reset() {
//   _reset(self[DECODER]);
//   self[NEXT_FIELD] = INVALID_FIELD_NUMBER;
//   self[NEXT_WIRE_TYPE] = WIRE_TYPE_INVALID;
// }

/**
 * Advances the stream cursor by the given number of bytes.
 */
// _advance(count: number) {
//   _advance(self[DECODER], count);
// }

/**
 * Reads the next field header in the stream if there is one, returns true if
 * we saw a valid field header or false if we've read the whole stream.
 * Throws an error if we encountered a deprecated START_GROUP/END_GROUP field.
 *
 * True if the stream contains more fields.
 */
export const nextField = (self: BinaryReader): boolean => {
  const decoder_ = self[DECODER];
  // If we're at the end of the block, there are no more fields.
  if (_atEnd(decoder_)) {
    return false;
  }

  // If we hit an error decoding the previous field, stop now before we
  // try to decode anything else
  if (getError(self)) {
    fail("Decoder hit an error");
    return false;
  }

  // Otherwise just read the header of the next field.
  self[FIELD_CURSOR] = _getCursor(decoder_);
  const header = _readUnsignedVarint32(decoder_);

  const nextField = header >>> 3;
  const nextWireType = header & 0x7;

  // If the wire isn't one of the valid ones, something's broken.
  if (
    nextWireType != WIRE_TYPE_VARINT &&
    nextWireType != WIRE_TYPE_FIXED32 &&
    nextWireType != WIRE_TYPE_FIXED64 &&
    nextWireType != WIRE_TYPE_DELIMITED &&
    nextWireType != WIRE_TYPE_START_GROUP &&
    nextWireType != WIRE_TYPE_END_GROUP
  ) {
    fail(`invalid wire: ${nextWireType} (at position ${self[FIELD_CURSOR]})`);
    self[ERROR] = true;
    return false;
  }

  self[NEXT_FIELD] = nextField;
  self[NEXT_WIRE_TYPE] = nextWireType;

  return true;
};

/**
 * Winds the reader back to just before self field's header.
 */
export const unskipHeader = (self: BinaryReader) => {
  _unskipVarint(self[DECODER], (self[NEXT_FIELD] << 3) | self[NEXT_WIRE_TYPE]);
};

/**
 * Skips all contiguous fields whose header matches the one we just read.
 */
export const skipMatchingFields = (self: BinaryReader) => {
  const field = self[NEXT_FIELD];
  unskipHeader(self);

  while (nextField(self) && getFieldNumber(self) == field) {
    skipField(self);
  }

  if (!_atEnd(self[DECODER])) {
    unskipHeader(self);
  }
};

/**
 * Skips over the next varint field in the binary stream.
 */
export const skipVarintField = (self: BinaryReader) => {
  if (self[NEXT_WIRE_TYPE] != WIRE_TYPE_VARINT) {
    fail("invalid wire for skipVarintField");
    skipField(self);
    return;
  }

  _skipVarint(self[DECODER]);
};

/**
 * Skips over the next delimited field in the binary stream.
 */
export const skipDelimitedField = (self: BinaryReader) => {
  if (self[NEXT_WIRE_TYPE] != WIRE_TYPE_DELIMITED) {
    fail("invalid wire for skipDelimitedField");
    skipField(self);
    return;
  }
  const decoder = self[DECODER];
  const length = _readUnsignedVarint32(decoder);
  _advance(decoder, length);
};

/**
 * Skips over the next fixed32 field in the binary stream.
 */
export const skipFixed32Field = (self: BinaryReader) => {
  if (self[NEXT_WIRE_TYPE] != WIRE_TYPE_FIXED32) {
    fail("invalid wire for skipFixed32Field");
    skipField(self);
    return;
  }

  _advance(self[DECODER], 4);
};

/**
 * Skips over the next fixed64 field in the binary stream.
 */
export const skipFixed64Field = (self: BinaryReader) => {
  if (self[NEXT_WIRE_TYPE] != WIRE_TYPE_FIXED64) {
    fail("invalid wire for skipFixed64Field");
    skipField(self);
    return;
  }

  _advance(self[DECODER], 8);
};

/**
 * Skips over the next group field in the binary stream.
 */
export const skipGroup = (self: BinaryReader) => {
  const previousField = self[NEXT_FIELD];
  // eslint-disable-next-line no-constant-condition , @typescript-eslint/no-unnecessary-condition
  while (true) {
    if (!nextField(self)) {
      fail("Unmatched start-group tag: stream EOF");
      self[ERROR] = true;
      return;
    }
    if (self[NEXT_WIRE_TYPE] == WIRE_TYPE_END_GROUP) {
      // Group end: check that it matches top-of-stack.
      if (self[NEXT_FIELD] != previousField) {
        fail("Unmatched end-group tag");
        self[ERROR] = true;
        return;
      }
      return;
    }
    skipField(self);
  }
};

/**
 * Skips over the next field in the binary stream - self is useful if we're
 * decoding a message that contain unknown fields.
 */
export const skipField = (self: BinaryReader) => {
  switch (self[NEXT_WIRE_TYPE]) {
    case WIRE_TYPE_VARINT:
      skipVarintField(self);
      break;
    case WIRE_TYPE_FIXED64:
      skipFixed64Field(self);
      break;
    case WIRE_TYPE_DELIMITED:
      skipDelimitedField(self);
      break;
    case WIRE_TYPE_FIXED32:
      skipFixed32Field(self);
      break;
    case WIRE_TYPE_START_GROUP:
      skipGroup(self);
      break;
    default:
      fail("invalid wire encoding for field.");
  }
};

/**
 * Registers a user-defined read callback.
 */
export const registerReadCallback = (
  self: BinaryReader,
  callbackName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (arg0: BinaryReader) => any,
) => {
  assert(!self[READ_CALLBACKS][callbackName]);
  self[READ_CALLBACKS][callbackName] = callback;
};

/**
 * Runs a registered read callback.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// export const runReadCallback = (
//   self: BinaryReader,
//   callbackName: string,
// ): any => {
//   const callback = self[READ_CALLBACKS][callbackName];
//   assert(!!callback);
//   return callback(self);
// };

/**
 * Reads a field of any valid non-message type from the binary stream.
 */
export const readAny = (
  self: BinaryReader,
  fieldType: number,
): number | boolean | string | Uint8Array => {
  self[NEXT_WIRE_TYPE] = FieldTypeToWireType(fieldType);
  switch (fieldType) {
    case FIELD_TYPE_DOUBLE:
      return readDouble(self);
    case FIELD_TYPE_FLOAT:
      return readFloat(self);
    case FIELD_TYPE_INT64:
      return readInt64(self);
    case FIELD_TYPE_UINT64:
      return readUint64(self);
    case FIELD_TYPE_INT32:
      return readInt32(self);
    case FIELD_TYPE_FIXED64:
      return readFixed64(self);
    case FIELD_TYPE_FIXED32:
      return readFixed32(self);
    case FIELD_TYPE_BOOL:
      return readBool(self);
    case FIELD_TYPE_STRING:
      return readString(self);
    case FIELD_TYPE_GROUP:
      fail("Group field type not supported in readAny()");
      break;
    case FIELD_TYPE_MESSAGE:
      fail("Message field type not supported in readAny()");
      break;
    case FIELD_TYPE_BYTES:
      return readBytes(self);
    case FIELD_TYPE_UINT32:
      return readUint32(self);
    case FIELD_TYPE_ENUM:
      return readEnum(self);
    case FIELD_TYPE_SFIXED32:
      return readSfixed32(self);
    case FIELD_TYPE_SFIXED64:
      return readSfixed64(self);
    case FIELD_TYPE_SINT32:
      return readSint32(self);
    case FIELD_TYPE_SINT64:
      return readSint64(self);
    case FIELD_TYPE_FHASH64:
      return readFixedHash64(self);
    case FIELD_TYPE_VHASH64:
      return readVarintHash64(self);
    default:
      fail("Invalid field type in readAny()");
  }
  return 0;
};

/**
 * Deserialize a proto into the provided message object using the provided
 * reader function. This function is templated as we currently have one client
 * who is using manual deserialization instead of the code-generated versions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readMessage = <T>(
  self: BinaryReader,
  message: T,
  /* eslint-disable  @typescript-eslint/no-explicit-any */
  reader: (arg0: T, arg1: BinaryReader) => any,
) => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_DELIMITED);

  // Save the current endpoint of the decoder and move it to the end of the
  // embedded message.
  const decoder_ = self[DECODER];
  const oldEnd = _getEnd(decoder_);
  const length = _readUnsignedVarint32(decoder_);
  const newEnd = _getCursor(decoder_) + length;
  _setEnd(decoder_, newEnd);

  // Deserialize the embedded message.
  reader(message, self);

  // Advance the decoder past the embedded message and restore the endpoint.
  _setCursor(decoder_, newEnd);
  _setEnd(decoder_, oldEnd);
};

/**
 * Deserialize a proto into the provided message object using the provided
 * reader function, assuming that the message is serialized as a group
 * with the given tag.
 */
export const readGroup = <T>(
  self: BinaryReader,
  field: number,
  message: T,
  reader: (arg0: T, arg1: BinaryReader) => T,
) => {
  // Ensure that the wire is correct.
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_START_GROUP);
  // Ensure that the field number is correct.
  assert(self[NEXT_FIELD] == field);

  // Deserialize the message. The deserialization will stop at an END_GROUP tag.
  reader(message, self);

  if (!self[ERROR] && self[NEXT_WIRE_TYPE] != WIRE_TYPE_END_GROUP) {
    fail("Group submessage did not end with an END_GROUP tag");
    self[ERROR] = true;
  }
};

/**
 * Return a decoder that wraps the current delimited field.
 */
export const getFieldDecoder = (self: BinaryReader): BinaryDecoder => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_DELIMITED);
  const decoder = self[DECODER];
  const length = _readUnsignedVarint32(decoder);
  const start = _getCursor(decoder);
  const end = start + length;

  const innerDecoder = _alloc(_getBuffer(decoder), start, length);
  _setCursor(decoder, end);
  return innerDecoder;
};

/**
 * Reads a signed 32-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readInt32 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readSignedVarint32(self[DECODER]);
};

/**
 * Reads a signed 32-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readInt32String = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readSignedVarint32String(self[DECODER]);
};

/**
 * Reads a signed 64-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readInt64 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readSignedVarint64(self[DECODER]);
};

/**
 * Reads a signed 64-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 *
 * Returns the value as a string.
 */
export const readInt64String = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readSignedVarint64String(self[DECODER]);
};

/**
 * Reads an unsigned 32-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readUint32 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readUnsignedVarint32(self[DECODER]);
};

/**
 * Reads an unsigned 32-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 *
 * Returns the value as a string.
 */
export const readUint32String = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readUnsignedVarint32String(self[DECODER]);
};

/**
 * Reads an unsigned 64-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readUint64 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readUnsignedVarint64(self[DECODER]);
};

/**
 * Reads an unsigned 64-bit integer field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 *
 * Returns the value as a string.
 */
export const readUint64String = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readUnsignedVarint64String(self[DECODER]);
};

/**
 * Reads a signed zigzag-encoded 32-bit integer field from the binary stream,
 * or throws an error if the next field in the stream is not of the correct
 * wire.
 */
export const readSint32 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readZigzagVarint32(self[DECODER]);
};

/**
 * Reads a signed zigzag-encoded 64-bit integer field from the binary stream,
 * or throws an error if the next field in the stream is not of the correct
 * wire.
 */
export const readSint64 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readZigzagVarint64(self[DECODER]);
};

/**
 * Reads a signed zigzag-encoded 64-bit integer field from the binary stream,
 * or throws an error if the next field in the stream is not of the correct
 * wire.
 */
export const readSint64String = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readZigzagVarint64String(self[DECODER]);
};

/**
 * Reads an unsigned 32-bit fixed-length integer fiield from the binary stream,
 * or throws an error if the next field in the stream is not of the correct
 * wire.
 */
export const readFixed32 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED32);
  return _readUint32(self[DECODER]);
};

/**
 * Reads an unsigned 64-bit fixed-length integer fiield from the binary stream,
 * or throws an error if the next field in the stream is not of the correct
 * wire.
 */
export const readFixed64 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readUint64(self[DECODER]);
};

/**
 * Reads a signed 64-bit integer field from the binary stream as a string, or
 * throws an error if the next field in the stream is not of the correct wire
 * type.
 *
 * Returns the value as a string.
 */
export const readFixed64String = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readUint64String(self[DECODER]);
};

/**
 * Reads a signed 32-bit fixed-length integer fiield from the binary stream, or
 * throws an error if the next field in the stream is not of the correct wire
 * type.
 */
export const readSfixed32 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED32);
  return _readInt32(self[DECODER]);
};

/**
 * Reads a signed 32-bit fixed-length integer fiield from the binary stream, or
 * throws an error if the next field in the stream is not of the correct wire
 * type.
 */
export const readSfixed32String = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED32);
  return _readInt32(self[DECODER]).toString();
};

/**
 * Reads a signed 64-bit fixed-length integer fiield from the binary stream, or
 * throws an error if the next field in the stream is not of the correct wire
 * type
 */
export const readSfixed64 = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readInt64(self[DECODER]);
};

/**
 * Reads a signed 64-bit fixed-length integer fiield from the binary stream, or
 * throws an error if the next field in the stream is not of the correct wire
 * type.
 *
 * Returns the value as a string.
 */
export const readSfixed64String = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readInt64String(self[DECODER]);
};

/**
 * Reads a 32-bit floating-point field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readFloat = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED32);
  return _readFloat(self[DECODER]);
};

/**
 * Reads a 64-bit floating-point field from the binary stream, or throws an
 * error if the next field in the stream is not of the correct wire.
 */
export const readDouble = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readDouble(self[DECODER]);
};

/**
 * Reads a boolean field from the binary stream, or throws an error if the next
 * field in the stream is not of the correct wire.
 */
export const readBool = (self: BinaryReader): boolean => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return !!_readUnsignedVarint32(self[DECODER]);
};

/**
 * Reads an enum field from the binary stream, or throws an error if the next
 * field in the stream is not of the correct wire.
 */
export const readEnum = (self: BinaryReader): number => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readSignedVarint64(self[DECODER]);
};

/**
 * Reads a string field from the binary stream, or throws an error if the next
 * field in the stream is not of the correct wire.
 */
export const readString = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_DELIMITED);
  const length = _readUnsignedVarint32(self[DECODER]);
  return _readString(self[DECODER], length);
};

/**
 * Reads a length-prefixed block of bytes from the binary stream, or returns
 * null if the next field in the stream has an invalid length value.
 */
export const readBytes = (self: BinaryReader): Uint8Array => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_DELIMITED);
  const length = _readUnsignedVarint32(self[DECODER]);
  return _readBytes(self[DECODER], length);
};

/**
 * Reads a 64-bit varint or fixed64 field from the stream and returns it as an
 * 8-character Unicode string for use as a hash table key, or throws an error
 * if the next field in the stream is not of the correct wire.
 */
export const readVarintHash64 = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readVarintHash64(self[DECODER]);
};

/**
 * Reads an sint64 field from the stream and returns it as an 8-character
 * Unicode string for use as a hash table key, or throws an error if the next
 * field in the stream is not of the correct wire.
 */
export const readSintHash64 = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readZigzagVarintHash64(self[DECODER]);
};

/**
 * Reads a 64-bit varint field from the stream and invokes `convert` to produce
 * the return value, or throws an error if the next field in the stream is not
 * of the correct wire.
 */
export const readSplitVarint64 = <T>(
  self: BinaryReader,
  convert: (arg0: number, arg1: number) => T,
): T => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_VARINT);
  return _readSplitVarint64(self[DECODER], convert);
};

/**
 * Reads a 64-bit varint or fixed64 field from the stream and returns it as a
 * 8-character Unicode string for use as a hash table key, or throws an error
 * if the next field in the stream is not of the correct wire.
 */
export const readFixedHash64 = (self: BinaryReader): string => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readFixedHash64(self[DECODER]);
};

/**
 * Reads a 64-bit fixed64 field from the stream and invokes `convert`
 * to produce the return value, or throws an error if the next field in the
 * stream is not of the correct wire.
 */
export const readSplitFixed64 = <T>(
  self: BinaryReader,
  convert: (arg0: number, arg1: number) => T,
): T => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_FIXED64);
  return _readSplitFixed64(self[DECODER], convert);
};

/**
 * Reads a packed scalar field using the supplied raw reader function.
 */
export const readPackedField_ = <T>(
  self: BinaryReader,
  decodeMethod: (self: BinaryDecoder) => T,
): Array<T> => {
  assert(self[NEXT_WIRE_TYPE] == WIRE_TYPE_DELIMITED);
  const decoder = self[DECODER];
  const length = _readUnsignedVarint32(decoder);
  const end = _getCursor(decoder) + length;
  const result = [];
  while (_getCursor(decoder) < end) {
    result.push(decodeMethod(decoder));
  }
  return result;
};

/**
 * Reads a packed int32 field, which consists of a length header and a list of
 * signed varints.
 */
export const readPackedInt32 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readSignedVarint32);
};

/**
 * Reads a packed int32 field, which consists of a length header and a list of
 * signed varints. Returns a list of strings.
 */
export const readPackedInt32String = (self: BinaryReader): Array<string> => {
  return readPackedField_(self, _readSignedVarint32String);
};

/**
 * Reads a packed int64 field, which consists of a length header and a list of
 * signed varints.
 */
export const readPackedInt64 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readSignedVarint64);
};

/**
 * Reads a packed int64 field, which consists of a length header and a list of
 * signed varints. Returns a list of strings.
 */
export const readPackedInt64String = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readSignedVarint64String);
};

/**
 * Reads a packed uint32 field, which consists of a length header and a list of
 * unsigned varints.
 */
export const readPackedUint32 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readUnsignedVarint32);
};

/**
 * Reads a packed uint32 field, which consists of a length header and a list of
 * unsigned varints. Returns a list of strings.
 */
export const readPackedUint32String = (self: BinaryReader): Array<string> => {
  return readPackedField_(self, _readUnsignedVarint32String);
};

/**
 * Reads a packed uint64 field, which consists of a length header and a list of
 * unsigned varints.
 */
export const readPackedUint64 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readUnsignedVarint64);
};

/**
 * Reads a packed uint64 field, which consists of a length header and a list of
 * unsigned varints. Returns a list of strings.
 */
export const readPackedUint64String = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readUnsignedVarint64String);
};

/**
 * Reads a packed sint32 field, which consists of a length header and a list of
 * zigzag varints.
 */
export const readPackedSint32 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readZigzagVarint32);
};

/**
 * Reads a packed sint64 field, which consists of a length header and a list of
 * zigzag varints.
 */
export const readPackedSint64 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readZigzagVarint64);
};

/**
 * Reads a packed sint64 field, which consists of a length header and a list of
 * zigzag varints.  Returns a list of strings.
 */
export const readPackedSint64String = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readZigzagVarint64String);
};

/**
 * Reads a packed fixed32 field, which consists of a length header and a list
 * of unsigned 32-bit ints.
 */
export const readPackedFixed32 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readUint32);
};

/**
 * Reads a packed fixed64 field, which consists of a length header and a list
 * of unsigned 64-bit ints.
 */
export const readPackedFixed64 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readUint64);
};

/**
 * Reads a packed fixed64 field, which consists of a length header and a list
 * of unsigned 64-bit ints.  Returns a list of strings.
 */
export const readPackedFixed64String = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readUint64String);
};

/**
 * Reads a packed sfixed32 field, which consists of a length header and a list
 * of 32-bit ints.
 */
export const readPackedSfixed32 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readInt32);
};

/**
 * Reads a packed sfixed64 field, which consists of a length header and a list
 * of 64-bit ints.
 */
export const readPackedSfixed64 = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readInt64);
};

/**
 * Reads a packed sfixed64 field, which consists of a length header and a list
 * of 64-bit ints.  Returns a list of strings.
 */
export const readPackedSfixed64String = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readInt64String);
};

/**
 * Reads a packed float field, which consists of a length header and a list of
 * floats.
 */
export const readPackedFloat = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readFloat);
};

/**
 * Reads a packed double field, which consists of a length header and a list of
 * doubles.
 */
export const readPackedDouble = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readDouble);
};

/**
 * Reads a packed bool field, which consists of a length header and a list of
 * unsigned varints.
 */
export const readPackedBool = (self: BinaryReader): Array<boolean> => {
  return readPackedField_(self, _readBool);
};

/**
 * Reads a packed enum field, which consists of a length header and a list of
 * unsigned varints.
 */
export const readPackedEnum = (self: BinaryReader): Array<number> => {
  return readPackedField_(self, _readEnum);
};

/**
 * Reads a packed varint hash64 field, which consists of a length header and a
 * list of varint hash64s.
 */
export const readPackedVarintHash64 = (self: BinaryReader): Array<string> => {
  return readPackedField_(self, _readVarintHash64);
};

/**
 * Reads a packed fixed hash64 field, which consists of a length header and a
 * list of fixed hash64s.
 */
export const readPackedFixedHash64 = (self: BinaryReader): Array<string> => {
  return readPackedField_(self, _readFixedHash64);
};
