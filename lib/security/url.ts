import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return first === 0 || first === 10 || first === 127 || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127);
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

export async function assertSafeRemoteUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("INVALID_REQUEST", "Remote URL is invalid", 400);
  }
  if (url.protocol !== "https:") throw new AppError("INVALID_REQUEST", "Remote requests must use HTTPS", 400);
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || isPrivateAddress(url.hostname)) throw new AppError("INVALID_REQUEST", "Remote requests cannot target private hosts", 400);
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (addresses.some((entry) => isPrivateAddress(entry.address))) throw new AppError("INVALID_REQUEST", "Remote requests cannot target private hosts", 400);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("EXTERNAL_SERVICE_ERROR", "Remote host could not be resolved", 502);
  }
  return url;
}
