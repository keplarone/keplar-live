/**
 * What the app stores allow, stated plainly. Checked against Apple's and Google's documentation in October 2026.
 * This is shown to the owner as-is; the UI must not promise anything beyond it.
 */
export const STORE_FACTS = {
  apple: {
    program: "Apple Developer Program",
    price: "$99 per year",
    needs: "An Apple Developer account (Account Holder signs the latest agreements), and an App Store Connect API key: Issuer ID, Key ID and the .p8 file.",
    api: "The App Store Connect API can read and update an app, its metadata, builds, TestFlight and pricing. It can NOT create the app record: POST /v1/apps is refused for API keys. You create the app once in the App Store Connect website (bundle ID, SKU, language); after that Keplar can check access and prepare the rest.",
    review: "Every submission goes through Apple's App Review. Keplar cannot skip or speed it up.",
  },
  google: {
    program: "Google Play Console",
    price: "$25 one-time registration",
    needs: "A Google Play developer account, a service account JSON key with the Android Publisher API enabled, and that service account invited in Play Console with permissions for the app.",
    api: "The Google Play Developer API edits an existing app (listings, tracks, releases). It can NOT create a new app: the app must exist in Play Console with its first bundle uploaded there, and legal declarations are completed in Play Console.",
    review: "New personal developer accounts may have extra testing requirements before production release; check Play Console.",
  },
  expo: {
    program: "Expo Application Services (EAS)",
    price: "Free tier with queued builds; paid plans for priority builds",
    needs: "An Expo account and an access token (used by the GitHub Actions workflow as EXPO_TOKEN).",
    api: "EAS Build compiles the project in the cloud and EAS Submit sends the build to the stores using the credentials above.",
    review: "Builds on the free tier can wait in a queue.",
  },
  honesty: "BETA. Keplar generates the project and checks your keys with the stores' own APIs. It has not yet built or submitted an app to either store on your behalf: building and submitting run in your GitHub repository with EAS, and the stores' review is theirs.",
} as const;

export const BUNDLE_ID = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z][a-zA-Z0-9-]*)+$/;
