const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

// Expo SDK 52+ configures monorepo watch folders and node_modules resolution automatically.
const config = getDefaultConfig(__dirname);

// Interim web database (ADR 0005): expo-sqlite on web runs wa-sqlite (WASM) in a worker with OPFS, which needs
// SharedArrayBuffer, i.e. cross-origin isolation: COOP same-origin + COEP credentialless. (Dev server here; the
// Hono server must send the same two headers for the production web export.)
const enhance = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const base = enhance ? enhance(middleware, server) : middleware;
    return (req, res, next) => {
      res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      return base(req, res, next);
    };
  },
};

const wrapped = withNativeWind(config, { input: "./global.css" });

// The wa-sqlite worker statically imports ./wa-sqlite/wa-sqlite.wasm. Adding "wasm" to resolver.assetExts makes Metro
// fail to resolve the router entry in this pnpm monorepo, so instead that one import resolves to an empty module and the
// real file is served from public/wa-sqlite.wasm and handed to the worker with configureWeb({ wasmURL }) (see
// src/data/database.ts). public/wa-sqlite.wasm must be the copy from the installed expo-sqlite.
const upstreamResolve = wrapped.resolver.resolveRequest;
wrapped.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith("wa-sqlite/wa-sqlite.wasm")) return { type: "empty" };
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = wrapped;
