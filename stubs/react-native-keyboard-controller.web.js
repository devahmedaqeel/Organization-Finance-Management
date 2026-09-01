/**
 * Web stub for react-native-keyboard-controller
 * This prevents the native TurboModule from crashing in web builds
 */
const React = require("react");

const KeyboardProvider = ({ children }) => children;
const KeyboardAwareScrollView = ({ children, ...props }) =>
  React.createElement("div", null, children);
const useKeyboardController = () => ({ enabled: false });
const useReanimatedKeyboardAnimation = () => ({ height: { value: 0 }, state: { value: 0 } });

module.exports = {
  KeyboardProvider,
  KeyboardAwareScrollView,
  useKeyboardController,
  useReanimatedKeyboardAnimation,
  KeyboardEvents: { addListener: () => ({ remove: () => {} }) },
};
