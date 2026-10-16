/**
 * Deterministic ids. Rows that two offline devices may create independently (an imported statement
 * line, the check-in for one day) get an id derived from their content, so both devices converge on
 * the same row instead of creating duplicates.
 */

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A stable UUID-shaped id from a hex digest (version nibble 8 = custom, RFC 9562). */
export function uuidFromHex(hex) {
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export async function stableUuid(text) {
  return uuidFromHex(await sha256Hex(text));
}
