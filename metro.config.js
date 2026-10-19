const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Alias react-native-keyboard-controller to a web-safe stub on web platform
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react-native-keyboard-controller" &&
    platform === "web"
  ) {
    return {
      filePath: path.resolve(
        __dirname,
        "stubs/react-native-keyboard-controller.web.js"
      ),
      type: "sourceFile",
    };
  }
  // Mobile: cap system font scaling app-wide by giving `react-native`'s Text / TextInput
  // exports a thin wrapper (see stubs/ScaledText.native.js). Only requests coming from
  // react-native's own index.js are redirected, so the wrappers still load the originals.
  if (platform !== "web" && /[\\/]node_modules[\\/]react-native[\\/]index\.js$/.test(context.originModulePath || "")) {
    if (moduleName === "./Libraries/Text/Text") {
      return { filePath: path.resolve(__dirname, "stubs/ScaledText.native.js"), type: "sourceFile" };
    }
    if (moduleName === "./Libraries/Components/TextInput/TextInput") {
      return { filePath: path.resolve(__dirname, "stubs/ScaledTextInput.native.js"), type: "sourceFile" };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
