// Mock react-native and Expo native modules for Node.js test environment
global.__DEV__ = true;
globalThis.expo = globalThis.expo || {
  EventEmitter: class EventEmitter {
    addListener() { return { remove() {} }; }
    removeListener() {}
    emit() {}
  }
};

const inMemoryStorage = new Map();
const asyncStorageMock = {
  getItem: async (k) => (inMemoryStorage.has(k) ? inMemoryStorage.get(k) : null),
  setItem: async (k, v) => { inMemoryStorage.set(k, String(v)); },
  removeItem: async (k) => { inMemoryStorage.delete(k); },
  clear: async () => { inMemoryStorage.clear(); },
  getAllKeys: async () => Array.from(inMemoryStorage.keys()),
  multiGet: async (keys) => keys.map((k) => [k, inMemoryStorage.get(k) || null]),
  multiSet: async (pairs) => { pairs.forEach(([k, v]) => inMemoryStorage.set(k, String(v))); },
  multiRemove: async (keys) => { keys.forEach((k) => inMemoryStorage.delete(k)); },
};
asyncStorageMock.default = asyncStorageMock;

const Module = require("module");
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === "@react-native-async-storage/async-storage") {
    return asyncStorageMock;
  }
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
  if (id === "expo-web-browser") {
    return {
      maybeCompleteAuthSession: () => {},
      openBrowserAsync: async () => ({ type: "cancel" }),
    };
  }
  if (id === "expo-auth-session") {
    return {
      makeRedirectUri: () => "https://ofm.app/auth",
    };
  }
  return origRequire.apply(this, arguments);
};
