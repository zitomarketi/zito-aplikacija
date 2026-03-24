const appJson = require("./app.json");

const defaultApiBase =
  appJson?.expo?.extra?.apiBase || "https://zito-cms-backend-new.onrender.com";
const defaultAppEnv = "development";

module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  plugins: Array.from(
    new Set([...(appJson.expo.plugins || []), "@react-native-community/datetimepicker"]),
  ),
  extra: {
    ...(appJson.expo.extra || {}),
    // One-time release config by team. End users never type backend URL.
    apiBase: process.env.EXPO_PUBLIC_API_BASE || defaultApiBase,
    appEnv: process.env.EXPO_PUBLIC_APP_ENV || defaultAppEnv,
    eas: {
      projectId:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
        appJson?.expo?.extra?.eas?.projectId ||
        undefined,
    },
  },
});
