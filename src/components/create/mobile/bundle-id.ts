/** A valid bundle ID from the app name: lower-case letters and digits only, never starting with a digit. */
export function suggestBundleId(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").replace(/^[0-9]+/, "").slice(0, 30);
  return slug ? `com.${slug}.app` : "";
}
