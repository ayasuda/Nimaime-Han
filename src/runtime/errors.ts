/** Error thrown for an invalid or conflicting element / condition / screen definition. */
export class NimaimeDefinitionError extends Error {
  override name = 'NimaimeDefinitionError';
}

/**
 * Error thrown by the runtime when a generated test refers to a Sanmaime name that cannot be
 * resolved (a missing element definition, target, `self` locator or condition) or when a
 * definition uses a fixture the test did not provide. The generator normally refuses to generate
 * such tests, so this is a safety net.
 */
export class NimaimeRuntimeError extends Error {
  override name = 'NimaimeRuntimeError';
}

/**
 * Error thrown when a `beforeScreen` / `afterScreen` / `beforeElement` / `afterElement` hook throws.
 * The message is prefixed with the hook and its scope (`BeforeElement hook for Element "Login
 * Form" failed: …`); `cause` is the original error, whose stack frames are kept.
 */
export class NimaimeHookError extends Error {
  override name = 'NimaimeHookError';
}
