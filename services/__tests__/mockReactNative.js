// Mock react-native and Expo native modules for Node.js test environment
global.__DEV__ = true;

const Module = require("module");
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "react-native") {
    return require("react-native-web");
  }
  if (id === "expo-file-system/legacy" || id === "expo-file-system") {
    return {
      documentDirectory: "/mock/dir/",
      writeAsStringAsync: async () => {},
      getInfoAsync: async () => ({ exists: true, size: 1024 }),
      deleteAsync: async () => {},
      EncodingType: { Base64: "base64", UTF8: "utf8" },
    };
  }
  if (id === "expo-sharing") {
    return {
      isAvailableAsync: async () => false,
      shareAsync: async () => {},
    };
  }
  return origRequire.apply(this, arguments);
};
