/**
 * We need CBOR to parse Cardano Byron addresses
 *    but CBOR parsing libraries are massive
 *    we want to avoid having to import megabytes JS code in the browser just for Cardano Byron address parsing
 *
 * As a middle ground, this file copies just the CBOR parsing code required for Byron checksum matching
 * reference: https://github.com/input-output-hk/cardano-js-sdk/blob/d1544fc9d1fb3997eb7c5b94a233789bb9e5cd9f/packages/core/src/Serialization/CBOR/MiniCborReader.ts#L26
 *
 * This file is 3kb when compressing with gzip
 */

import { Buffer } from "node:buffer";

type HexBlob = string;

export const CborContentException = Error;
export const CborInvalidOperationException = Error;

export enum CborReaderState {
  Undefined = 0,
  UnsignedInteger,
  NegativeInteger,
  ByteString,
  StartIndefiniteLengthByteString,
  EndIndefiniteLengthByteString,
  TextString,
  StartIndefiniteLengthTextString,
  EndIndefiniteLengthTextString,
  StartArray,
  EndArray,
  StartMap,
  EndMap,
  Tag,
  SimpleValue,
  HalfPrecisionFloat,
  SinglePrecisionFloat,
  DoublePrecisionFloat,
  Null,
  Boolean,
  Finished,
}

export enum CborMajorType {
  UnsignedInteger = 0,
  NegativeInteger = 1,
  ByteString = 2,
  Utf8String = 3,
  Array = 4,
  Map = 5,
  Tag = 6,
  Simple = 7,
}

type StackFrame = {
  type: CborMajorType | null;
  frameOffset: number;
  definiteLength?: number;
  itemsRead: number;
  currentKeyOffset: number | null;
};

export enum CborTag {
  DateTimeString = 0,
  UnixTimeSeconds = 1,
  UnsignedBigNum = 2,
  NegativeBigNum = 3,
  DecimalFraction = 4,
  BigFloat = 5,
  Base64UrlLaterEncoding = 21,
  Base64StringLaterEncoding = 22,
  Base16StringLaterEncoding = 23,
  EncodedCborDataItem = 24,
  RationalNumber = 30,
  Uri = 32,
  Base64Url = 33,
  Base64 = 34,
  Regex = 35,
  MimeMessage = 36,
  Set = 258,
  SelfDescribeCbor = 55_799,
}

const UNEXPECTED_END_OF_BUFFER_MSG = "Unexpected end of buffer";

export enum CborAdditionalInfo {
  AdditionalFalse = 20,
  AdditionalTrue = 21,
  AdditionalNull = 22,
  Additional8BitData = 24,
  Additional16BitData = 25,
  Additional32BitData = 26,
  Additional64BitData = 27,
  IndefiniteLength = 31,
}

export class CborInitialByte {
  static readonly IndefiniteLengthBreakByte = 0xff;
  static readonly AdditionalInformationMask = 0b0001_1111;

  constructor(private initialByte: number) {}
  CborInitialByte(
    majorType: CborMajorType,
    additionalInfo: CborAdditionalInfo,
  ) {
    this.initialByte = (majorType << 5) | additionalInfo;
  }
  static from(initialByte: number) {
    const init = new CborInitialByte(initialByte);

    return init;
  }
  getInitialByte(): number {
    return this.initialByte;
  }
  getMajorType(): CborMajorType {
    return this.initialByte >> 5;
  }
  getAdditionalInfo(): CborAdditionalInfo {
    return this.initialByte & CborInitialByte.AdditionalInformationMask;
  }
}

export class MiniCborReader {
  readonly #data: Uint8Array;
  #offset = 0;
  #nestedItems: Array<StackFrame> = new Array<StackFrame>();
  #isTagContext = false;
  #currentFrame: StackFrame;
  #cachedState = CborReaderState.Undefined;

  constructor(data: HexBlob) {
    this.#data = new Uint8Array(Buffer.from(data, "hex"));
    this.#currentFrame = {
      currentKeyOffset: null,
      frameOffset: 0,
      itemsRead: 0,
      type: null,
    };
  }

  readStartArray(): number | null {
    const header: CborInitialByte = this.#peekInitialByte(CborMajorType.Array);

    if (header.getAdditionalInfo() === CborAdditionalInfo.IndefiniteLength) {
      this.#advanceBuffer(1);
      this.#pushDataItem(CborMajorType.Array);
      return null;
    }

    const buffer = this.#getRemainingBytes();
    const { length, bytesRead } = MiniCborReader.#peekDefiniteLength(
      header,
      buffer,
    );

    this.#advanceBuffer(bytesRead);
    this.#pushDataItem(CborMajorType.Array, length);
    return length;
  }

  readTag(): CborTag {
    const { tag, bytesRead } = this.#peekTagCore();

    this.#advanceBuffer(bytesRead);
    this.#isTagContext = true;
    return tag;
  }

  readByteString(): Uint8Array {
    const header = this.#peekInitialByte(CborMajorType.ByteString);

    if (header.getAdditionalInfo() === CborAdditionalInfo.IndefiniteLength) {
      const { val, encodingLength } = this
        .#readIndefiniteLengthByteStringConcatenated(
          CborMajorType.ByteString,
        );

      this.#advanceBuffer(encodingLength);
      this.#advanceDataItemCounters();

      return val;
    }

    const buffer = this.#getRemainingBytes();
    const { length, bytesRead } = MiniCborReader.#peekDefiniteLength(
      header,
      buffer,
    );

    this.#ensureReadCapacity(bytesRead + length);
    this.#advanceBuffer(bytesRead + length);
    this.#advanceDataItemCounters();

    return buffer.slice(bytesRead, bytesRead + length);
  }

  readInt(): bigint {
    const value = this.#peekSignedInteger();
    this.#advanceBuffer(value.bytesRead);
    this.#advanceDataItemCounters();
    return value.signedInt;
  }

  #peekSignedInteger(): { signedInt: bigint; bytesRead: number } {
    const header: CborInitialByte = this.#peekInitialByte();

    switch (header.getMajorType()) {
      case CborMajorType.UnsignedInteger: {
        const { unsignedInt: signedInt, bytesRead } = MiniCborReader
          .#decodeUnsignedInteger(
            header,
            this.#getRemainingBytes(),
          );

        return { bytesRead, signedInt: BigInt(signedInt) };
      }
      case CborMajorType.NegativeInteger: {
        const { unsignedInt, bytesRead } = MiniCborReader
          .#decodeUnsignedInteger(
            header,
            this.#getRemainingBytes(),
          );

        return { bytesRead, signedInt: BigInt(-1) - unsignedInt };
      }
      default:
        throw new CborInvalidOperationException(
          `Reader type mismatch, expected ${CborMajorType.UnsignedInteger} or ${CborMajorType.NegativeInteger} but got ${header.getMajorType()}`,
        );
    }
  }

  #ensureReadCapacity(bytesToRead: number) {
    if (this.#data.length - this.#offset < bytesToRead) {
      throw new CborContentException(UNEXPECTED_END_OF_BUFFER_MSG);
    }
  }

  #readIndefiniteLengthByteStringConcatenated(type: CborMajorType): {
    val: Uint8Array;
    encodingLength: number;
  } {
    const data = this.#getRemainingBytes();
    let concat = Buffer.from([]);
    let encodingLength = 0;

    let i = 1; // skip the indefinite-length initial byte

    let nextInitialByte = MiniCborReader.#peekNextInitialByte(
      data.slice(i),
      type,
    );

    while (
      nextInitialByte.getInitialByte() !==
        CborInitialByte.IndefiniteLengthBreakByte
    ) {
      const { length: chunkLength, bytesRead } = MiniCborReader
        .#peekDefiniteLength(
          nextInitialByte,
          data.slice(i),
        );
      const payloadSize = bytesRead + Number(chunkLength);

      concat = Buffer.concat([
        concat as any, // TODO: remove `as any` once @types/node gets updated properly
        data.slice(i + (payloadSize - chunkLength), i + payloadSize),
      ]);

      i += payloadSize;

      nextInitialByte = MiniCborReader.#peekNextInitialByte(
        data.slice(i),
        type,
      );
    }

    encodingLength = i + 1; // include the break byte

    return { encodingLength, val: new Uint8Array(concat) };
  }

  #advanceDataItemCounters() {
    ++this.#currentFrame.itemsRead;
    this.#isTagContext = false;
  }

  static #peekNextInitialByte(
    buffer: Uint8Array,
    expectedType?: CborMajorType,
  ): CborInitialByte {
    MiniCborReader.ensureReadCapacityInArray(buffer, 1);
    const header = CborInitialByte.from(buffer[0]);

    if (
      header.getInitialByte() !== CborInitialByte.IndefiniteLengthBreakByte &&
      header.getMajorType() !== expectedType
    ) {
      throw new CborContentException(
        "Indefinite length string contains invalid data item",
      );
    }

    return header;
  }

  #peekTagCore(): { tag: CborTag; bytesRead: number } {
    const header: CborInitialByte = this.#peekInitialByte(CborMajorType.Tag);
    const { unsignedInt: result, bytesRead } = MiniCborReader
      .#decodeUnsignedInteger(
        header,
        this.#getRemainingBytes(),
      );

    return { bytesRead, tag: Number(result) as CborTag };
  }

  static #peekDefiniteLength(
    header: CborInitialByte,
    data: Uint8Array,
  ): { length: number; bytesRead: number } {
    const { unsignedInt: length, bytesRead } = MiniCborReader
      .#decodeUnsignedInteger(header, data);
    return { bytesRead, length: Number(length) };
  }

  #peekInitialByte(expectedType?: CborMajorType): CborInitialByte {
    if (
      this.#currentFrame.definiteLength !== undefined &&
      this.#currentFrame.definiteLength - this.#currentFrame.itemsRead === 0
    ) {
      throw new CborInvalidOperationException("No more data items to read");
    }

    if (this.#offset === this.#data.length) {
      if (
        this.#currentFrame.type === null &&
        this.#currentFrame.definiteLength === undefined &&
        this.#offset > 0
      ) {
        throw new CborInvalidOperationException(
          "End of root-level. No more data items to read",
        );
      }

      throw new CborContentException(UNEXPECTED_END_OF_BUFFER_MSG);
    }

    const nextByte = CborInitialByte.from(this.#data[this.#offset]);

    switch (this.#currentFrame.type) {
      case CborMajorType.ByteString:
      case CborMajorType.Utf8String:
        // Indefinite-length string contexts allow two possible data items:
        // 1) Definite-length string chunks of the same major type OR
        // 2) a break byte denoting the end of the indefinite-length string context.
        if (
          nextByte.getInitialByte() ===
            CborInitialByte.IndefiniteLengthBreakByte ||
          (nextByte.getMajorType() === this.#currentFrame.type &&
            nextByte.getAdditionalInfo() !==
              CborAdditionalInfo.IndefiniteLength)
        ) {
          break;
        }

        throw new CborContentException(
          `Indefinite length string contains invalid data item, ${nextByte.getMajorType()}`,
        );
    }

    if (expectedType && expectedType !== nextByte.getMajorType()) {
      throw new CborInvalidOperationException(
        `Major type mismatch, expected type ${expectedType} but got ${nextByte.getMajorType()}`,
      );
    }

    return nextByte;
  }

  static #decodeUnsignedInteger(
    header: CborInitialByte,
    data: Uint8Array,
  ): { unsignedInt: bigint; bytesRead: number } {
    if (
      (header.getInitialByte() & CborInitialByte.AdditionalInformationMask) <
        CborAdditionalInfo.Additional8BitData
    ) {
      return { bytesRead: 1, unsignedInt: BigInt(header.getAdditionalInfo()) };
    }

    switch (header.getAdditionalInfo()) {
      case CborAdditionalInfo.Additional8BitData: {
        MiniCborReader.ensureReadCapacityInArray(data, 2);

        return { bytesRead: 2, unsignedInt: BigInt(data[1]) };
      }
      case CborAdditionalInfo.Additional16BitData: {
        MiniCborReader.ensureReadCapacityInArray(data, 3);

        const buffer = Buffer.from(data.slice(1));
        const val = buffer.readUInt16BE();

        return { bytesRead: 3, unsignedInt: BigInt(val) };
      }
      case CborAdditionalInfo.Additional32BitData: {
        MiniCborReader.ensureReadCapacityInArray(data, 5);

        const buffer = Buffer.from(data.slice(1));
        const val = buffer.readUInt32BE();

        return { bytesRead: 5, unsignedInt: BigInt(val) };
      }
      case CborAdditionalInfo.Additional64BitData: {
        MiniCborReader.ensureReadCapacityInArray(data, 9);

        const buffer = Buffer.from(data.slice(1, 9));

        let result = BigInt(0);

        for (const element of buffer) {
          result = (result << BigInt(8)) + BigInt(element);
        }

        return { bytesRead: 9, unsignedInt: result };
      }
      default:
        throw new CborContentException("Invalid integer encoding");
    }
  }

  static ensureReadCapacityInArray(data: Uint8Array, bytesToRead: number) {
    if (data.length < bytesToRead) {
      throw new CborContentException(UNEXPECTED_END_OF_BUFFER_MSG);
    }
  }

  #advanceBuffer(length: number) {
    if (this.#offset + length > this.#data.length) {
      throw new CborContentException("Buffer offset out of bounds");
    }
    this.#offset += length;
    this.#cachedState = CborReaderState.Undefined;
  }

  #pushDataItem(majorType: CborMajorType, definiteLength?: number): void {
    const frame: StackFrame = {
      currentKeyOffset: this.#currentFrame.currentKeyOffset,
      definiteLength: this.#currentFrame.definiteLength,
      frameOffset: this.#currentFrame.frameOffset,
      itemsRead: this.#currentFrame.itemsRead,
      type: this.#currentFrame.type,
    };

    this.#nestedItems.push(frame);

    this.#currentFrame.type = majorType;
    this.#currentFrame.definiteLength = definiteLength;
    this.#currentFrame.itemsRead = 0;
    this.#currentFrame.frameOffset = this.#offset;
    this.#isTagContext = false;
    this.#currentFrame.currentKeyOffset = null;
  }

  #getRemainingBytes(): Uint8Array {
    return this.#data.slice(this.#offset);
  }
}
