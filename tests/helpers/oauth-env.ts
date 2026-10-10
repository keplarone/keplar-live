/** Import first: Google/Microsoft must be configured before the auth module is evaluated. */
process.env.BETTER_AUTH_SECRET ||= "test-secret-for-sessions-0123456789abcdefghij";
process.env.BETTER_AUTH_URL ||= "https://keplar.one";
process.env.KEPLAR_DEV_TOOLS = "1";
process.env.GOOGLE_CLIENT_ID = "google-test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
process.env.MICROSOFT_CLIENT_ID = "00000000-1111-2222-3333-444444444444";
process.env.MICROSOFT_CLIENT_SECRET = "ms-test-secret";
