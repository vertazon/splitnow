const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force Babel to transform packages that use import.meta syntax,
// which Metro skips by default for node_modules.
const defaultIgnore = config.transformer?.transformIgnorePatterns?.[0]
  ?? 'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?(/.*)?|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)';

config.transformer.transformIgnorePatterns = [
  defaultIgnore.replace(
    'node_modules/(?!(',
    'node_modules/(?!(react-devtools-core|sucrase|'
  ),
];

module.exports = config;
