const { getDefaultConfig } = require("expo/metro-config");

// Expo SDK 52+ configures monorepo watch folders and node_modules resolution automatically.
module.exports = getDefaultConfig(__dirname);
