/**
 * A ZIP writer, because a `.docx` is a ZIP of XML parts and nothing more.
 *
 * Hand-written rather than pulled in: the alternative is a document library an
 * order of magnitude larger than this file, shipped to every visitor, to produce
 * a few kilobytes of markup we want precise control over anyway. The whole
 * format used here is the 1989 one — local header, central directory, end
 * record — with no compression, no encryption, no ZIP64. Resume parts are a few
 * kilobytes, so deflating them would trade clarity for nothing measurable.
 *
 * Every entry is stored uncompressed (method 0), which every ZIP reader
 * including Word's has always supported.
 */

export interface ZipEntry {
  /** Path inside the archive, forward slashes, no leading slash. */
  path: string;
  text: string;
}

/**
 * A fixed timestamp — 1 January 1980, the earliest the format can express.
 *
 * The real time would make the same document hash differently on every download,
 * which makes "did this change?" unanswerable. Nothing reads a resume's zip
 * timestamp, so it buys nothing to leak the hour someone applied for a job.
 */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      // The reflected CRC-32 polynomial, as the format specifies.
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Little-endian writes, which is the only byte order the format uses. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  get offset(): number {
    return this.length;
  }

  bytes(value: Uint8Array): void {
    this.chunks.push(value);
    this.length += value.length;
  }

  u16(value: number): void {
    this.bytes(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.bytes(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  }
}

/**
 * Bit 11 of the general-purpose flags: names and text are UTF-8.
 *
 * Set unconditionally. Without it a reader is entitled to interpret bytes above
 * 127 as code page 437, which is how a résumé becomes a rÃ©sumÃ©.
 */
const UTF8_FLAG = 0x0800;

export function zipSync(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const body = new ByteWriter();
  const directory = new ByteWriter();

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const data = encoder.encode(entry.text);
    const crc = crc32(data);
    const localOffset = body.offset;

    body.u32(0x04034b50); // local file header
    body.u16(20); // version needed
    body.u16(UTF8_FLAG);
    body.u16(0); // stored
    body.u16(DOS_TIME);
    body.u16(DOS_DATE);
    body.u32(crc);
    body.u32(data.length); // compressed size — identical, being stored
    body.u32(data.length);
    body.u16(name.length);
    body.u16(0); // extra field length
    body.bytes(name);
    body.bytes(data);

    directory.u32(0x02014b50); // central directory header
    directory.u16(20); // version made by
    directory.u16(20); // version needed
    directory.u16(UTF8_FLAG);
    directory.u16(0);
    directory.u16(DOS_TIME);
    directory.u16(DOS_DATE);
    directory.u32(crc);
    directory.u32(data.length);
    directory.u32(data.length);
    directory.u16(name.length);
    directory.u16(0); // extra
    directory.u16(0); // comment
    directory.u16(0); // disk number start
    directory.u16(0); // internal attributes
    directory.u32(0); // external attributes
    directory.u32(localOffset);
    directory.bytes(name);
  }

  const directoryOffset = body.offset;
  const directoryBytes = directory.concat();

  const end = new ByteWriter();
  end.u32(0x06054b50); // end of central directory
  end.u16(0); // this disk
  end.u16(0); // disk with the directory
  end.u16(entries.length);
  end.u16(entries.length);
  end.u32(directoryBytes.length);
  end.u32(directoryOffset);
  end.u16(0); // archive comment

  const out = new Uint8Array(
    body.offset + directoryBytes.length + end.offset,
  );
  out.set(body.concat(), 0);
  out.set(directoryBytes, body.offset);
  out.set(end.concat(), body.offset + directoryBytes.length);

  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
