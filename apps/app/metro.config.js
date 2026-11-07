const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Expo SDK 52+ configures monorepo watch folders and node_modules resolution automatically.
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" });
