const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/** Replace UUIDs in an ASC API path with `<id>`. */
export function sanitisePath(path: string): string {
  return path.replace(UUID_RE, "<id>");
}

/** Replace UUIDs and JWTs in arbitrary text with placeholders. */
export function sanitiseText(text: unknown): string {
  const value = typeof text === "string"
    ? text
    : text == null
      ? ""
      : String(text);
  return value.replace(JWT_RE, "<jwt>").replace(UUID_RE, "<id>");
}
