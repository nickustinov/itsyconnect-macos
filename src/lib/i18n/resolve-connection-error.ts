import type { ConnectionError } from "@/lib/apps-context";
import type { MessageKey } from "./messages";

const SERVER_MESSAGE_KEYS: Record<string, MessageKey> = {
  "API key may be invalid or expired": "connectionErrors.authInvalid",
  "App Store Connect is temporarily unavailable": "connectionErrors.ascUnavailable",
  "Could not connect to App Store Connect": "connectionErrors.ascUnreachable",
};

const ASC_ERROR_RE = /^App Store Connect returned an error \((\d+)\)$/;

/** Resolve a connection error to a user-facing string. */
export function resolveConnectionErrorMessage(
  error: ConnectionError,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  if (error.key) return t(error.key);

  const msg = error.message.trim();
  if (!msg) return t("common.unknownError");

  const mapped = SERVER_MESSAGE_KEYS[msg];
  if (mapped) return t(mapped);

  const statusMatch = msg.match(ASC_ERROR_RE);
  if (statusMatch) {
    return t("connectionErrors.ascError", { status: statusMatch[1] });
  }

  // ASC API detail text – keep server message as-is
  return msg;
}
