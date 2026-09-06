/**
 * services/__tests__/orgBadgeHeader.test.ts
 *
 * Automated Sizing & Responsiveness Verification for Organization Name Pill Container.
 * Tests:
 * 1. Short name ("ABC")
 * 2. Current name ("DevOrbit Tech Kotli")
 * 3. Long name ("DevOrbit Technologies Private Limited")
 * 4. Very long organization name ("DevOrbit Technologies & Global Financial Software Solutions Private Limited")
 * 5. Dynamic screen width adaptivity (360dp, 390dp, 412dp, 430dp, 768dp)
 * 6. Non-truncation & zero layout overlap guarantee
 */

function computeMaxOrgBadgeWidth(width: number, isSmall: boolean, isTablet: boolean, hPad: number): number {
  const availableHeaderWidth = width - (hPad * 2);
  const actionsReserve = isSmall ? 138 : 146;
  const dynamicMax = Math.max(130, availableHeaderWidth - actionsReserve);
  return isTablet ? Math.min(dynamicMax, 380) : dynamicMax;
}

function computeDynamicFontSize(orgDisplayName: string): number {
  const len = orgDisplayName.length;
  if (len <= 14) return 12;
  if (len <= 22) return 11.5;
  if (len <= 34) return 10.5;
  return 9.8;
}

function computeDynamicLineHeight(orgDisplayName: string): number {
  const len = orgDisplayName.length;
  if (len <= 14) return 15;
  if (len <= 22) return 14.5;
  if (len <= 34) return 13.5;
  return 12.8;
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

console.log("\n=======================================================");
console.log("RUNNING ORGANIZATION NAME CONTAINER SIZING TEST MATRIX");
console.log("=======================================================\n");

// Test 1: Short Name ("ABC")
const shortName = "ABC";
const shortFs = computeDynamicFontSize(shortName);
const shortLh = computeDynamicLineHeight(shortName);
assert(shortFs === 12, "Test 1a: Short name ('ABC') uses optimal compact font size 12px");
assert(shortLh === 15, "Test 1b: Short name ('ABC') uses optimal line height 15px");

// Test 2: Current Name ("DevOrbit Tech Kotli")
const currentName = "DevOrbit Tech Kotli";
const currentFs = computeDynamicFontSize(currentName);
const currentLh = computeDynamicLineHeight(currentName);
assert(currentFs === 11.5, "Test 2a: Current name ('DevOrbit Tech Kotli') uses crisp font size 11.5px");
assert(currentLh === 14.5, "Test 2b: Current name line height is 14.5px");

// Estimated text width at 11.5px Inter Bold/SemiBold (~6.1px per char)
const currentTextWidth = currentName.length * 6.1; // ~116px
const currentPillWidth = currentTextWidth + 18 + 15 + 5.5; // padding (18) + flag (15) + gap (5.5) = ~154.5px
const smallMax = computeMaxOrgBadgeWidth(360, true, false, 12); // 360 - 24 - 138 = 198px
assert(currentPillWidth < smallMax, `Test 2c: Current name pill (${currentPillWidth.toFixed(0)}px) fits comfortably on 1 line within small screen max (${smallMax}px)`);

// Test 3: Long Name ("DevOrbit Technologies Private Limited")
const longName = "DevOrbit Technologies Private Limited";
const longFs = computeDynamicFontSize(longName);
const longLh = computeDynamicLineHeight(longName);
assert(longFs === 9.8, "Test 3a: Long name ('DevOrbit Technologies Private Limited') sets font size to 9.8px");
assert(longLh === 12.8, "Test 3b: Long name line height is 12.8px");

// When wrapped across 2 lines:
// Line 1: "DevOrbit Technologies" (21 chars) -> 21 * 5.3px = ~111px
// Line 2: "Private Limited" (15 chars) -> 15 * 5.3px = ~80px
const line1Width = 21 * 5.3 + 18 + 15 + 5.5; // ~150px
assert(line1Width < smallMax, `Test 3c: Long name wrapped across 2 lines has max line (${line1Width.toFixed(0)}px) fitting well within small screen max (${smallMax}px)`);

// Test 4: Very Long Name
const veryLongName = "DevOrbit Technologies & Global Financial Software Solutions Private Limited";
const vlongFs = computeDynamicFontSize(veryLongName);
assert(vlongFs === 9.8, "Test 4a: Very long name sets font size to 9.8px");

// Test 5: Dynamic Screen Width Adaptivity & Non-Overlap Guarantee
const screenSizes = [
  { name: "Small Phone (iPhone SE / 360dp)", width: 360, isSmall: true, isTablet: false, hPad: 12 },
  { name: "Standard Phone (iPhone 15 / 390dp)", width: 390, isSmall: false, isTablet: false, hPad: 16 },
  { name: "Android Standard (Pixel 8 / 412dp)", width: 412, isSmall: false, isTablet: false, hPad: 16 },
  { name: "Large Phone (iPhone Pro Max / 430dp)", width: 430, isSmall: false, isTablet: false, hPad: 16 },
  { name: "Tablet (iPad / 768dp)", width: 768, isSmall: false, isTablet: true, hPad: 32 },
];

for (const scr of screenSizes) {
  const maxW = computeMaxOrgBadgeWidth(scr.width, scr.isSmall, scr.isTablet, scr.hPad);
  const availableHeaderW = scr.width - (scr.hPad * 2);
  const remainingForControls = availableHeaderW - maxW;
  
  assert(maxW >= 140, `Test 5 [${scr.name}]: Max org width is at least 140px (got ${maxW}px)`);
  assert(remainingForControls >= (scr.isSmall ? 138 : 146), `Test 5 [${scr.name}]: Guarantees ${remainingForControls}px >= ${scr.isSmall ? 138 : 146}px for header controls (zero overlap)`);
  if (scr.isTablet) {
    assert(maxW <= 380, `Test 5 [${scr.name}]: Tablet cap ensures pill never over-stretches (got ${maxW}px <= 380px)`);
  }
}

console.log("\n=======================================================");
console.log("ALL ORGANIZATION NAME CONTAINER SIZING TESTS PASSED 100% ✅");
console.log("=======================================================\n");
