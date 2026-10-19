/** TextInput counterpart of ScaledText.native.js — same cap, all TextInput statics preserved. */
const React = require("react");
const RNTextInput = require("react-native/Libraries/Components/TextInput/TextInput").default;
const { MAX_FONT_SCALE } = require("./ScaledText.native");

function TextInput(props) {
  return React.createElement(
    RNTextInput,
    props.maxFontSizeMultiplier == null ? { ...props, maxFontSizeMultiplier: MAX_FONT_SCALE } : props
  );
}
// Keep TextInput.State (focus helpers) and any other statics the app or libraries rely on
Object.keys(RNTextInput).forEach((key) => {
  if (!(key in TextInput)) TextInput[key] = RNTextInput[key];
});
TextInput.displayName = "TextInput";

module.exports = { __esModule: true, default: TextInput };
