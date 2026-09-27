import {
  MAX_IMAGE_ASSET_BYTES,
  MAX_JSON_ENTRY_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES,
  MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES
} from './importLimits';
import type { PackValidationIssue } from './packTypes';
import { extensionOf } from './assetSafety';
import { ALLOWED_IMAGE_EXTENSIONS } from './packTypes';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const MIN_EOCD_SIZE = 22;
const MAX_EOCD_SEARCH = 0xffff + MIN_EOCD_SIZE;
const ZIP64_U16 = 0xffff;
const ZIP64_U32 = 0xffffffff;

export interface ZipSafetyInspection {
  issues: PackValidationIssue[];
  uncompressedBytesByPath: Map<string, number>;
}

function error(message: string, path?: string): PackValidationIssue {
  return { level: 'error', message, path };
}

function findEndOfCentralDirectory(view: DataView): number {
  const start = Math.max(0, view.byteLength - MAX_EOCD_SEARCH);
  for (let offset = view.byteLength - MIN_EOCD_SIZE; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

export function inspectZipSafety(buffer: ArrayBuffer): ZipSafetyInspection {
  const issues: PackValidationIssue[] = [];
  const uncompressedBytesByPath = new Map<string, number>();
  if (buffer.byteLength < MIN_EOCD_SIZE) return { issues: [error('ZIP file is truncated or invalid.')], uncompressedBytesByPath };

  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return { issues: [error('ZIP central directory was not found.')], uncompressedBytesByPath };

  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    issues.push(error('Multi-disk ZIP files are not supported.'));
    return { issues, uncompressedBytesByPath };
  }
  if (totalEntries === ZIP64_U16 || centralSize === ZIP64_U32 || centralOffset === ZIP64_U32) {
    issues.push(error('ZIP64 imports are not supported.'));
    return { issues, uncompressedBytesByPath };
  }
  if (totalEntries > MAX_ZIP_ENTRY_COUNT) issues.push(error(`ZIP contains too many entries (max ${MAX_ZIP_ENTRY_COUNT}).`));
  if (centralOffset + centralSize > view.byteLength) {
    issues.push(error('ZIP central directory points outside the file.'));
    return { issues, uncompressedBytesByPath };
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) {
      issues.push(error(`ZIP central directory entry ${index + 1} is malformed.`));
      break;
    }

    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const recordLength = 46 + fileNameLength + extraLength + commentLength;
    if (offset + recordLength > view.byteLength) {
      issues.push(error(`ZIP central directory entry ${index + 1} is truncated.`));
      break;
    }
    if (compressedSize === ZIP64_U32 || uncompressedSize === ZIP64_U32) {
      issues.push(error('ZIP64 entries are not supported.'));
      break;
    }

    const nameBytes = new Uint8Array(buffer, offset + 46, fileNameLength);
    const path = decoder.decode(nameBytes).replace(/\\/g, '/');
    uncompressedBytesByPath.set(path, uncompressedSize);
    totalUncompressed += uncompressedSize;

    if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
      issues.push(error('ZIP entry is too large after expansion.', path));
    }
    if (['manifest.json', 'modules.json', 'questions.json'].includes(path) && uncompressedSize > MAX_JSON_ENTRY_BYTES) {
      issues.push(error('Pack JSON entry is too large.', path));
    }
    if (ALLOWED_IMAGE_EXTENSIONS.includes(extensionOf(path)) && uncompressedSize > MAX_IMAGE_ASSET_BYTES) {
      issues.push(error('Image asset is too large.', path));
    }

    offset += recordLength;
  }

  if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
    issues.push(error('ZIP expands beyond the allowed total size.'));
  }
  return { issues, uncompressedBytesByPath };
}
