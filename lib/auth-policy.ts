export function isAllowedGoogleSignIn(provider: string | undefined, profile: unknown): boolean {
  return (
    provider === "google" &&
    typeof profile === "object" &&
    profile !== null &&
    "email_verified" in profile &&
    profile.email_verified === true &&
    "email" in profile &&
    typeof profile.email === "string" &&
    profile.email.trim().length > 0
  );
}