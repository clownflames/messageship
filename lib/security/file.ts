import { AppError } from "@/lib/errors";

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function isUtf8Text(bytes: Uint8Array): boolean {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).length > 0;
  } catch {
    return false;
  }
}

export function assertFileSignature(bytes: Uint8Array, mimeType: string): void {
  const valid = mimeType === "image/jpeg" ? startsWith(bytes, [0xff, 0xd8, 0xff])
    : mimeType === "image/png" ? startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])
      : mimeType === "image/webp" ? startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
        : mimeType === "application/pdf" ? startsWith(bytes, [0x25, 0x50, 0x44, 0x46])
          : mimeType === "video/mp4" || mimeType === "video/3gpp" ? startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)
            : mimeType === "audio/ogg" ? startsWith(bytes, [0x4f, 0x67, 0x67, 0x53])
              : mimeType === "audio/mpeg" ? startsWith(bytes, [0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2))
                : mimeType === "audio/mp4" || mimeType === "audio/aac" ? startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4) || startsWith(bytes, [0xff, 0xf1])
                  : mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ? startsWith(bytes, [0x50, 0x4b])
                    : mimeType === "text/plain" ? isUtf8Text(bytes)
                      : true;
  if (!valid) throw new AppError("INVALID_REQUEST", "File content does not match its declared type", 400);
}
