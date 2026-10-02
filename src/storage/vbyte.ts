/**
 * Variable-Byte (Varint / LEB128) compression codec for 32-bit unsigned integers.
 * Encodes small integers in 1-2 bytes instead of 4, saving 65%-75% disk space.
 */

/**
 * Encodes a single non-negative 32-bit integer into a variable-byte byte array.
 */
export function encodeVarint(value: number): Uint8Array {
  let v = value >>> 0;
  const bytes: number[] = [];

  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);

  return new Uint8Array(bytes);
}

/**
 * Decodes a single variable-byte integer from a buffer at the specified offset.
 */
export function decodeVarint(
  buffer: Uint8Array,
  offset: number = 0
): { value: number; bytesRead: number } {
  let result = 0;
  let shift = 0;
  let bytesRead = 0;

  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead]!;
    bytesRead++;
    result |= (byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, bytesRead };
    }

    shift += 7;
    if (shift >= 35) {
      throw new Error('Varint overflow: encoded integer exceeds 32 bits');
    }
  }

  throw new Error('Unexpected end of buffer while decoding varint');
}

/**
 * Encodes a series of integers into a single contiguous variable-byte buffer.
 */
export function encodeVarints(values: number[]): Uint8Array {
  const writer = new BufferWriter(values.length * 2);
  for (const val of values) {
    writer.writeVarint(val);
  }
  return writer.toBytes();
}

/**
 * Decodes a specified count of varint-encoded integers from a buffer starting at offset.
 */
export function decodeVarints(
  buffer: Uint8Array,
  count: number,
  startOffset: number = 0
): { values: number[]; bytesRead: number } {
  const values: number[] = new Array(count);
  let currentOffset = startOffset;

  for (let i = 0; i < count; i++) {
    const { value, bytesRead } = decodeVarint(buffer, currentOffset);
    values[i] = value;
    currentOffset += bytesRead;
  }

  return {
    values,
    bytesRead: currentOffset - startOffset,
  };
}

/**
 * High-performance, dynamically-expanding byte buffer writer for binary serialization.
 */
export class BufferWriter {
  private buffer: Uint8Array;
  private offset: number = 0;
  private dataView: DataView;

  constructor(initialCapacity: number = 256) {
    this.buffer = new Uint8Array(Math.max(16, initialCapacity));
    this.dataView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
  }

  public get position(): number {
    return this.offset;
  }

  public writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.buffer[this.offset++] = value & 0xff;
  }

  public writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.dataView.setUint16(this.offset, value, true); // Little-endian
    this.offset += 2;
  }

  public writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.dataView.setUint32(this.offset, value, true); // Little-endian
    this.offset += 4;
  }

  public writeFloat32(value: number): void {
    this.ensureCapacity(4);
    this.dataView.setFloat32(this.offset, value, true); // Little-endian
    this.offset += 4;
  }

  public writeVarint(value: number): void {
    let v = value >>> 0;
    while (v >= 0x80) {
      this.writeUint8((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    this.writeUint8(v & 0x7f);
  }

  public writeBytes(bytes: Uint8Array): void {
    this.ensureCapacity(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  public writeString(str: string): void {
    const encoded = new TextEncoder().encode(str);
    this.writeUint16(encoded.length);
    this.writeBytes(encoded);
  }

  public writeLongString(str: string): void {
    const encoded = new TextEncoder().encode(str);
    this.writeUint32(encoded.length);
    this.writeBytes(encoded);
  }

  public toBytes(): Uint8Array {
    return this.buffer.slice(0, this.offset);
  }

  private ensureCapacity(neededBytes: number): void {
    if (this.offset + neededBytes <= this.buffer.length) {
      return;
    }

    let newCap = Math.max(this.buffer.length * 2, this.offset + neededBytes);
    const newBuf = new Uint8Array(newCap);
    newBuf.set(this.buffer);
    this.buffer = newBuf;
    this.dataView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
  }
}

/**
 * Sequential reader for parsing binary buffers with zero-copy slices where appropriate.
 */
export class BufferReader {
  private readonly buffer: Uint8Array;
  private readonly dataView: DataView;
  private offset: number = 0;

  constructor(buffer: Uint8Array, startOffset: number = 0) {
    this.buffer = buffer;
    this.offset = startOffset;
    this.dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  public get position(): number {
    return this.offset;
  }

  public get remaining(): number {
    return this.buffer.length - this.offset;
  }

  public seek(offset: number): void {
    if (offset < 0 || offset > this.buffer.length) {
      throw new RangeError(`Seek offset ${offset} out of bounds [0, ${this.buffer.length}]`);
    }
    this.offset = offset;
  }

  public readUint8(): number {
    this.checkBounds(1);
    return this.buffer[this.offset++]!;
  }

  public readUint16(): number {
    this.checkBounds(2);
    const val = this.dataView.getUint16(this.offset, true);
    this.offset += 2;
    return val;
  }

  public readUint32(): number {
    this.checkBounds(4);
    const val = this.dataView.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }

  public readFloat32(): number {
    this.checkBounds(4);
    const val = this.dataView.getFloat32(this.offset, true);
    this.offset += 4;
    return val;
  }

  public readVarint(): number {
    const { value, bytesRead } = decodeVarint(this.buffer, this.offset);
    this.offset += bytesRead;
    return value;
  }

  public readBytes(length: number): Uint8Array {
    this.checkBounds(length);
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  public readString(): string {
    const len = this.readUint16();
    const bytes = this.readBytes(len);
    return new TextDecoder().decode(bytes);
  }

  public readLongString(): string {
    const len = this.readUint32();
    const bytes = this.readBytes(len);
    return new TextDecoder().decode(bytes);
  }

  private checkBounds(needed: number): void {
    if (this.offset + needed > this.buffer.length) {
      throw new RangeError(
        `Buffer underflow: requested ${needed} bytes at offset ${this.offset}, length is ${this.buffer.length}`
      );
    }
  }
}
