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
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
