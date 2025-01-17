export const FIELD_TYPE_INVALID = -1;
export const FIELD_TYPE_DOUBLE = 1;
export const FIELD_TYPE_FLOAT = 2;
export const FIELD_TYPE_INT64 = 3;
export const FIELD_TYPE_UINT64 = 4;
export const FIELD_TYPE_INT32 = 5;
export const FIELD_TYPE_FIXED64 = 6;
export const FIELD_TYPE_FIXED32 = 7;
export const FIELD_TYPE_BOOL = 8;
export const FIELD_TYPE_STRING = 9;
export const FIELD_TYPE_GROUP = 10;
export const FIELD_TYPE_MESSAGE = 11;
export const FIELD_TYPE_BYTES = 12;
export const FIELD_TYPE_UINT32 = 13;
export const FIELD_TYPE_ENUM = 14;
export const FIELD_TYPE_SFIXED32 = 15;
export const FIELD_TYPE_SFIXED64 = 16;
export const FIELD_TYPE_SINT32 = 17;
export const FIELD_TYPE_SINT64 = 18;

// Extended types for Javascript
export const FIELD_TYPE_FHASH64 = 30; // 64-bit hash string, fixed-length encoding.
export const FIELD_TYPE_VHASH64 = 31; // 64-bit hash string, varint encoding.

// export type FieldType = (typeof FieldType)[keyof typeof FieldType];

/**
 * Wire-format type codes, taken from proto2/public/wire_format_lite.h.
 */
export const WIRE_TYPE_INVALID = -1;
export const WIRE_TYPE_VARINT = 0;
export const WIRE_TYPE_FIXED64 = 1;
export const WIRE_TYPE_DELIMITED = 2;
export const WIRE_TYPE_START_GROUP = 3;
export const WIRE_TYPE_END_GROUP = 4;
export const WIRE_TYPE_FIXED32 = 5;

// export type WireType = (typeof WireType)[keyof typeof WireType];

/**
 * Translates field type to wire.
 */
export const FieldTypeToWireType = function (fieldType: number): number {
  switch (fieldType) {
    case FIELD_TYPE_INT32:
    case FIELD_TYPE_INT64:
    case FIELD_TYPE_UINT32:
    case FIELD_TYPE_UINT64:
    case FIELD_TYPE_SINT32:
    case FIELD_TYPE_SINT64:
    case FIELD_TYPE_BOOL:
    case FIELD_TYPE_ENUM:
    case FIELD_TYPE_VHASH64:
      return WIRE_TYPE_VARINT;
    case FIELD_TYPE_DOUBLE:
    case FIELD_TYPE_FIXED64:
    case FIELD_TYPE_SFIXED64:
    case FIELD_TYPE_FHASH64:
      return WIRE_TYPE_FIXED64;
    case FIELD_TYPE_STRING:
    case FIELD_TYPE_MESSAGE:
    case FIELD_TYPE_BYTES:
      return WIRE_TYPE_DELIMITED;
    case FIELD_TYPE_FLOAT:
    case FIELD_TYPE_FIXED32:
    case FIELD_TYPE_SFIXED32:
      return WIRE_TYPE_FIXED32;
    case FIELD_TYPE_INVALID:
    case FIELD_TYPE_GROUP:
    default:
      return WIRE_TYPE_INVALID;
  }
};

/**
 * Flag to indicate a missing field.
 */
export const INVALID_FIELD_NUMBER = -1;

/**
 * The smallest normal float64 value.
 */
export const FLOAT32_MIN = 1.1754943508222875e-38;

/**
 * The largest finite float32 value.
 */
export const FLOAT32_MAX = 3.4028234663852886e38;

/**
 * The smallest normal float64 value.
 */
export const FLOAT64_MIN = 2.2250738585072014e-308;

/**
 * The largest finite float64 value.
 */
export const FLOAT64_MAX = 1.7976931348623157e308;

/**
 * Convenience constant equal to 2^20.
 */
export const TWO_TO_20 = 1048576;

/**
 * Convenience constant equal to 2^23.
 */
export const TWO_TO_23 = 8388608;

/**
 * Convenience constant equal to 2^31.
 */
export const TWO_TO_31 = 2147483648;

/**
 * Convenience constant equal to 2^32.
 */
export const TWO_TO_32 = 4294967296;

/**
 * Convenience constant equal to 2^52.
 */
export const TWO_TO_52 = 4503599627370496;

/**
 * Convenience constant equal to 2^63.
 */
export const TWO_TO_63 = 9223372036854775808;

/**
 * Convenience constant equal to 2^64.
 */
export const TWO_TO_64 = 18446744073709551616;
