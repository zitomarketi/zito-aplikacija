const appJson = require("./app.json");

const defaultApiBase =
  appJson?.expo?.extra?.apiBase || "http://localhost:8000";

module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  extra: {
    ...(appJson.expo.extra || {}),
    // One-time release config by team. End users never type backend URL.
    apiBase: process.env.EXPO_PUBLIC_API_BASE || defaultApiBase,
  },
});

