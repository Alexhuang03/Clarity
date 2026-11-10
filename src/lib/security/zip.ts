import "server-only";
import { promisify } from "node:util";
import zlib from "node:zlib";

// Protection contre les « bombes de décompression » (DOCX / PPTX = archives ZIP) :
// un fichier de quelques Mo peut se décompresser en plusieurs Go et faire tomber le serveur.
// Chaque entrée est réellement décompressée avec un plafond (les tailles annoncées dans
// l'archive peuvent mentir), avant que mammoth / JSZip ne la lisent sans limite.

const inflateRaw = promisify(zlib.inflateRaw) as (buf: Buffer, options: zlib.ZlibOptions) => Promise<Buffer>;

export type ZipLimits = {
  /** Taille décompressée totale maximale (octets) */
  maxTotalBytes?: number;
  /** Nombre maximal d'entrées */
  maxEntries?: number;
};

export class UnsafeArchiveError extends Error {}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Lève UnsafeArchiveError si l'archive est invalide, trop grosse une fois décompressée, ou a trop d'entrées. */
export async function assertSafeZip(data: Uint8Array, { maxTotalBytes = 200 * 1024 * 1024, maxEntries = 5000 }: ZipLimits = {}) {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  // Fin du répertoire central : dans les 64 Ko + 22 derniers octets
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new UnsafeArchiveError("Archive illisible.");
  const entries = buf.readUInt16LE(eocd + 10);
  const centralOffset = buf.readUInt32LE(eocd + 16);
  // ZIP64 (0xFFFF / 0xFFFFFFFF) : inutile pour un document de cours, refusé
  if (entries === 0xffff || centralOffset === 0xffffffff) throw new UnsafeArchiveError("Archive trop volumineuse.");
  if (entries > maxEntries) throw new UnsafeArchiveError("Archive avec trop de fichiers.");

  let total = 0;
  let pos = centralOffset;
  for (let n = 0; n < entries; n++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== CENTRAL_SIGNATURE) throw new UnsafeArchiveError("Archive illisible.");
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const nameLength = buf.readUInt16LE(pos + 28);
    const extraLength = buf.readUInt16LE(pos + 30);
    const commentLength = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    pos += 46 + nameLength + extraLength + commentLength;

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      throw new UnsafeArchiveError("Archive illisible.");
    }
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const end = Math.min(buf.length, dataStart + compressedSize);
    const remaining = maxTotalBytes - total;
    if (method === 0) {
      total += end - dataStart;
    } else if (method === 8) {
      try {
        const out = await inflateRaw(buf.subarray(dataStart, end), { maxOutputLength: Math.max(1, remaining + 1) });
        total += out.length;
      } catch (error) {
        if ((error as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") throw new UnsafeArchiveError("Archive trop volumineuse une fois décompressée.");
        // Flux tronqué (taille annoncée incohérente) : JSZip échouera de toute façon
        throw new UnsafeArchiveError("Archive illisible.");
      }
    } else {
      throw new UnsafeArchiveError("Archive dans un format de compression non pris en charge.");
    }
    if (total > maxTotalBytes) throw new UnsafeArchiveError("Archive trop volumineuse une fois décompressée.");
  }
}
