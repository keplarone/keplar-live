/**
 * Mobile project generator (BETA). Produces a plain Expo / React Native project from a small spec. Deterministic, no model call, no
 * network. It has NOT been built on EAS by Keplar; the README says so and tells the owner how to run `expo install --fix` to align
 * package versions with the installed SDK.
 */
import { BUNDLE_ID } from "./facts";

export type MobileSpec = { name: string; bundleId: string; tagline?: string; screens: { title: string; body: string }[]; accent?: "white" | "graphite" };
export class SpecError extends Error {}

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "app";
const js = (s: string) => JSON.stringify(s); // safe string literal for generated source

export function normalizeSpec(raw: Partial<MobileSpec>): MobileSpec {
  const name = clean(String(raw.name ?? ""), 30);
  if (name.length < 2) throw new SpecError("Give the app a name (2 to 30 characters).");
  const bundleId = String(raw.bundleId ?? "").trim();
  if (!BUNDLE_ID.test(bundleId) || bundleId.length > 100) throw new SpecError("The bundle ID should look like com.yourname.appname (letters, numbers, hyphens, dots).");
  const screens = (Array.isArray(raw.screens) ? raw.screens : []).slice(0, 6).map((s) => ({ title: clean(String(s?.title ?? ""), 24), body: clean(String(s?.body ?? ""), 400) })).filter((s) => s.title);
  if (!screens.length) throw new SpecError("Add at least one screen.");
  return { name, bundleId, tagline: raw.tagline ? clean(String(raw.tagline), 80) : undefined, screens, accent: raw.accent === "graphite" ? "graphite" : "white" };
}

export function mobileProject(input: Partial<MobileSpec>): Record<string, string> {
  const spec = normalizeSpec(input);
  const s = slug(spec.name);
  const bg = spec.accent === "graphite" ? "#1b1b1f" : "#0b0b0d";
  const files: Record<string, string> = {};
  files["package.json"] = JSON.stringify({
    name: s, version: "1.0.0", private: true, main: "index.js",
    scripts: { start: "expo start", android: "expo start --android", ios: "expo start --ios", typecheck: "tsc --noEmit" },
    dependencies: { expo: "~57.0.0", "expo-status-bar": "~57.0.0", react: "19.2.3", "react-native": "0.86.2" },
    devDependencies: { typescript: "~5.9.0", "@types/react": "~19.2.0" },
  }, null, 2) + "\n";
  files["app.json"] = JSON.stringify({
    expo: { name: spec.name, slug: s, version: "1.0.0", orientation: "portrait", userInterfaceStyle: "dark", ios: { bundleIdentifier: spec.bundleId, supportsTablet: true }, android: { package: spec.bundleId }, backgroundColor: bg },
  }, null, 2) + "\n";
  files["eas.json"] = JSON.stringify({
    cli: { version: ">= 16.0.0", appVersionSource: "remote" },
    build: { preview: { distribution: "internal" }, production: { autoIncrement: true } },
    submit: { production: {} },
  }, null, 2) + "\n";
  files["tsconfig.json"] = JSON.stringify({ compilerOptions: { strict: true, jsx: "react-native", target: "esnext", module: "esnext", moduleResolution: "bundler", skipLibCheck: true, noEmit: true }, include: ["**/*.ts", "**/*.tsx"] }, null, 2) + "\n";
  files["index.js"] = `import { registerRootComponent } from "expo";\nimport App from "./App";\n\nregisterRootComponent(App);\n`;
  files["App.tsx"] = `import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

const NAME = ${js(spec.name)};
const TAGLINE = ${js(spec.tagline ?? "")};
const SCREENS: { title: string; body: string }[] = ${JSON.stringify(spec.screens, null, 2)};

export default function App() {
  const [index, setIndex] = useState(0);
  const screen = SCREENS[index];
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.name}>{NAME}</Text>
        {TAGLINE ? <Text style={styles.tagline}>{TAGLINE}</Text> : null}
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{screen.title}</Text>
        <Text style={styles.text}>{screen.body}</Text>
      </ScrollView>
      <View style={styles.tabs} accessibilityRole="tablist">
        {SCREENS.map((s, i) => (
          <Pressable key={s.title} accessibilityRole="tab" accessibilityState={{ selected: i === index }} onPress={() => setIndex(i)} style={[styles.tab, i === index && styles.tabOn]}>
            <Text style={[styles.tabText, i === index && styles.tabTextOn]}>{s.title}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ${js(bg)} },
  header: { paddingHorizontal: 24, paddingTop: 24 },
  name: { color: "#ffffff", fontSize: 28, fontWeight: "600" },
  tagline: { color: "#a4a6ad", marginTop: 4, fontSize: 15 },
  body: { padding: 24, gap: 12 },
  title: { color: "#ffffff", fontSize: 22, fontWeight: "500" },
  text: { color: "#d4d5da", fontSize: 16, lineHeight: 24 },
  tabs: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3a3b42" },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabOn: { backgroundColor: "#ffffff14" },
  tabText: { color: "#a4a6ad", fontSize: 13 },
  tabTextOn: { color: "#ffffff" },
});
`;
  files[".github/workflows/eas-build.yml"] = `# BETA. Builds the app with EAS when you run this workflow by hand. Keplar has not run it for you.
# Needs a repository secret named EXPO_TOKEN (create it at expo.dev > Account settings > Access tokens).
# Submitting to the stores also needs your store credentials set up in EAS: run \`eas credentials\` and \`eas submit\` locally once.
name: EAS build
on:
  workflow_dispatch:
    inputs:
      platform:
        description: Platform
        type: choice
        options: [all, ios, android]
        default: all
      profile:
        description: Build profile
        type: choice
        options: [preview, production]
        default: preview
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: \${{ secrets.EXPO_TOKEN }}
      - run: npm install
      - run: npx expo install --fix
      - run: eas build --platform \${{ inputs.platform }} --profile \${{ inputs.profile }} --non-interactive --no-wait
`;
  files["README.md"] = `# ${spec.name}

Generated by Keplar (BETA). A starting Expo / React Native project: ${spec.screens.length} screen${spec.screens.length === 1 ? "" : "s"}, dark graphite look, no blue.

**Honest status:** Keplar has not built or submitted this project for you. It is untested on devices until you run it.

## Run it
1. Install Node 22 or newer.
2. \`npm install\` then \`npx expo install --fix\` (aligns package versions with the Expo SDK you have).
3. \`npx expo start\` and open it in Expo Go, or press \`i\` / \`a\` for a simulator.

## Put it in the stores
- Apple: ${"$99"}/year Apple Developer Program. Create the app record once in App Store Connect with bundle ID \`${spec.bundleId}\` (the API cannot create it). Then \`eas build -p ios --profile production\` and \`eas submit -p ios\`.
- Google: ${"$25"} one-time Play Console registration. Create the app in Play Console and upload the first bundle there (the API cannot create it). Then \`eas build -p android --profile production\` and \`eas submit -p android\`.
- The workflow in \`.github/workflows/eas-build.yml\` runs EAS builds from GitHub (needs \`EXPO_TOKEN\`).
- Both stores review every submission. That is theirs, not Keplar's.
`;
  return files;
}
