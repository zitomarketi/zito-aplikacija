const { withMainActivity } = require("@expo/config-plugins");

function applyIntentImport(src) {
  if (src.includes("import android.content.Intent")) return src;
  return src.replace(
    'package com.anonymous.zitoapp\n\n',
    'package com.anonymous.zitoapp\n\nimport android.content.Intent\n',
  );
}

function applyOnNewIntentOverride(src) {
  if (src.includes("override fun onNewIntent(intent: Intent)")) return src;
  const marker = "    super.onCreate(null)\n  }\n";
  const injection =
    "    super.onCreate(null)\n  }\n\n" +
    "  override fun onNewIntent(intent: Intent) {\n" +
    "    super.onNewIntent(intent)\n" +
    "    setIntent(intent)\n" +
    "  }\n";
  return src.replace(marker, injection);
}

module.exports = function withOAuthIntentFix(config) {
  return withMainActivity(config, (config) => {
    let src = config.modResults.contents;
    src = applyIntentImport(src);
    src = applyOnNewIntentOverride(src);
    config.modResults.contents = src;
    return config;
  });
};
