/**
 * App-wide text scaling cap (Android / iOS only, wired up in metro.config.js).
 *
 * Every `import { Text, TextInput } from "react-native"` receives these thin wrappers,
 * which add `maxFontSizeMultiplier` unless a component sets its own. Users with a large
 * system font still get bigger text, but layouts no longer blow up.
 */
const React = require("react");
const RNText = require("react-native/Libraries/Text/Text").default;

const MAX_FONT_SCALE = 1.15;

function Text(props) {
  return React.createElement(
    RNText,
    props.maxFontSizeMultiplier == null ? { ...props, maxFontSizeMultiplier: MAX_FONT_SCALE } : props
  );
}
Text.displayName = "Text";

module.exports = { __esModule: true, default: Text, MAX_FONT_SCALE };
