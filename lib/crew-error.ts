/**
 * Expected crew-domain failure (missing permission, duplicate name, row already
 * gone). The message is user-facing Turkish copy, so the action layer can show
 * it as-is.
 *
 * One shared class on purpose: the services are split across modules (some are
 * importable from the plain-Node test suite, some are `server-only`), and two
 * look-alike classes would make `instanceof` in the action layer miss half of
 * them, turning a clear message into a generic failure.
 */
export class CrewError extends Error {}
