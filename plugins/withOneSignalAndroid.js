const { withSettingsGradle, withAppBuildGradle, withMainApplication } = require('@expo/config-plugins');

// Custom plugin to wire up react-native-onesignal v5 in Expo managed workflow.
// Needed because onesignal-expo-plugin installs as an empty directory on Windows.
// Does three things:
//   1. Adds the library as a gradle subproject (settings.gradle)
//   2. Adds it as a dependency (app/build.gradle)
//   3. Registers ReactNativeOneSignalPackage (MainApplication.kt)
// The library's own AndroidManifest.xml merges automatically via tools:node="merge".

function withOneSignalAndroid(config) {
  // ─── settings.gradle ─────────────────────────────────────────────────────────
  config = withSettingsGradle(config, (config) => {
    if (!config.modResults.contents.includes('react-native-onesignal')) {
      config.modResults.contents +=
        "\ninclude ':react-native-onesignal'\n" +
        "project(':react-native-onesignal').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-onesignal/android')\n";
    }
    return config;
  });

  // ─── app/build.gradle ────────────────────────────────────────────────────────
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("project(':react-native-onesignal')")) {
      config.modResults.contents = config.modResults.contents.replace(
        /implementation\("com\.facebook\.react:react-android"\)/,
        `implementation("com.facebook.react:react-android")\n    implementation project(':react-native-onesignal')`
      );
    }
    return config;
  });

  // ─── MainApplication.kt ──────────────────────────────────────────────────────
  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes('ReactNativeOneSignalPackage')) {
      contents = contents.replace(
        'import com.facebook.react.PackageList',
        'import com.facebook.react.PackageList\nimport com.onesignal.rnonesignalandroid.ReactNativeOneSignalPackage'
      );
      contents = contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n              add(ReactNativeOneSignalPackage())'
      );
      config.modResults.contents = contents;
    }
    return config;
  });

  return config;
}

module.exports = withOneSignalAndroid;
