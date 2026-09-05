import { Feather } from "@/components/UniversalIcon";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState, useEffect } from "react";
import {
  Dimensions,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";

interface Slide {
  id: string;
  titleEn: string;
  titleUr: string;
  descEn: string;
  descUr: string;
  icon: string;
  color: string;
  bgColor: string;
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    titleEn: "Welcome to OFM",
    titleUr: "OFM App Mein Khushamdeed",
    descEn: "Your premium, comprehensive Organization Finance Manager. Handle income, expenses, and payroll seamlessly in real-time.",
    descUr: "Apni organization ke income, expenses, aur payroll ko real-time mein manage karein intehai aasan aur premium design ke sath.",
    icon: "home",
    color: "#3B82F6",
    bgColor: "#E0F2FE",
  },
  {
    id: "roles",
    titleEn: "Team Roles & Sync",
    titleUr: "Team Roles Aur Sync",
    descEn: "Admins create organizations, Accountants register transactions dynamically, and Managers review analytics with real-time updates.",
    descUr: "Admins organization banate hain, Accountants entries karte hain, aur Managers financial reports monitor karte hain.",
    icon: "users",
    color: "#8B5CF6",
    bgColor: "#F3E8FF",
  },
  {
    id: "alerts",
    titleEn: "Instant Push Alerts",
    titleUr: "Fauri Notification Alerts",
    descEn: "Receive native system notifications and gorgeous sliding in-app toasts with sound/haptics when team members add or edit logs.",
    descUr: "Jab bhi koi user transaction post karega, aapko screen aur notification drawer mein fauri alert aur push notification milegi.",
    icon: "bell",
    color: "#F59E0B",
    bgColor: "#FEF3C7",
  },
  {
    id: "invites",
    titleEn: "Gmail Auto Invitations",
    titleUr: "Gmail Auto Invitations",
    descEn: "Invite colleagues directly via serverless automated Gmail integration pre-filled with setup steps, APK links, and invite codes.",
    descUr: "Apne staff ko background Gmail alerts ke zariye invite karein jisme direct setup links aur invite codes shamil honge.",
    icon: "mail",
    color: "#EC4899",
    bgColor: "#FCE7F3",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useResponsive();
  const flatListRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [language, setLanguage] = useState<"en" | "ur">("en");
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const webTop = Platform.OS === "web" ? 67 : 0;

  // Speak active slide content
  const speakActiveSlide = (index: number, currentLanguage: "en" | "ur") => {
    // Halts any active track
    Speech.stop();

    if (!isVoiceEnabled) return;

    const activeSlide = SLIDES[index];
    if (!activeSlide) return;

    const title = currentLanguage === "en" ? activeSlide.titleEn : activeSlide.titleUr;
    const desc = currentLanguage === "en" ? activeSlide.descEn : activeSlide.descUr;
    
    // Combine title and desc for natural reading
    const textToSpeak = `${title}. ${desc}`;

    Speech.speak(textToSpeak, {
      language: currentLanguage === "en" ? "en-US" : "hi-IN", // hi-IN (Hindi) uses identical phonetics to read Urdu flawlessly
      pitch: 1.0,
      rate: 0.9,
    });
  };

  // Monitor slide or language changes to speak
  useEffect(() => {
    speakActiveSlide(activeIndex, language);
    return () => {
      Speech.stop();
    };
  }, [activeIndex, language, isVoiceEnabled]);

  // Safe Haptic Helpers for Web & Mobile
  const safeHaptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(style);
      } catch {}
    }
  };

  const safeHapticNotification = (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.notificationAsync(type);
      } catch {}
    }
  };

  const handleScroll = (event: any) => {
    const scrollOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollOffset / width);
    if (index !== activeIndex && index >= 0 && index < SLIDES.length) {
      setActiveIndex(index);
      safeHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleNext = () => {
    const nextIndex = activeIndex + 1;
    if (nextIndex < SLIDES.length) {
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setActiveIndex(nextIndex);
      safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
    handleFinish();
  };

  const handleFinish = async () => {
    try {
      Speech.stop();
      await AsyncStorage.setItem("ofm_onboarding_seen", "true");
      safeHapticNotification(Haptics.NotificationFeedbackType.Success);
      router.replace("/login");
    } catch (e) {
      console.warn("AsyncStorage Error saving onboarding state:", e);
      router.replace("/login");
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Upper Navigation Row (Language Switch + Volume Switch + Skip) */}
      <View style={[styles.navHeader, { paddingTop: webTop + Math.max(insets.top, 20) + 14 }]}>
        {/* Premium Language Switcher */}
        <View style={[styles.langSwitcher, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.langBtn, language === "en" && { backgroundColor: colors.primary }]}
            onPress={() => { safeHaptic(Haptics.ImpactFeedbackStyle.Light); setLanguage("en"); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.langText, { color: language === "en" ? "#fff" : colors.mutedForeground }]}>EN</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === "ur" && { backgroundColor: colors.primary }]}
            onPress={() => { safeHaptic(Haptics.ImpactFeedbackStyle.Light); setLanguage("ur"); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.langText, { color: language === "ur" ? "#fff" : colors.mutedForeground, fontSize: 11 }]}>اردو</Text>
          </TouchableOpacity>
        </View>

        {/* Volume Voice Guide Toggle */}
        <TouchableOpacity
          style={[
            styles.volumeBtn,
            { 
              backgroundColor: colors.card, 
              borderColor: isVoiceEnabled ? colors.primary : colors.border,
              shadowColor: isVoiceEnabled ? colors.primary : "transparent"
            }
          ]}
          onPress={() => {
            safeHaptic(Haptics.ImpactFeedbackStyle.Medium);
            setIsVoiceEnabled(!isVoiceEnabled);
          }}
          activeOpacity={0.7}
        >
          <Feather
            name={isVoiceEnabled ? "volume-2" : "volume-x"}
            size={16}
            color={isVoiceEnabled ? colors.primary : colors.mutedForeground}
          />
        </TouchableOpacity>

        <View style={{ flex: 1 }} />
        
        {activeIndex < SLIDES.length - 1 ? (
          <TouchableOpacity style={[styles.skipBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={handleSkip}>
            <Text style={[styles.skipBtnText, { color: colors.mutedForeground }]}>
              {language === "en" ? "Skip" : "چھوڑیں"}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Slide list */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View style={[styles.slideWrap, { width }]}>
            {/* Visual Circular Vector Indicator */}
            <View style={[styles.circleArt, { backgroundColor: item.bgColor }]}>
              <View style={[styles.innerCircle, { backgroundColor: item.color }]}>
                <Feather name={item.icon} size={48} color="#fff" />
              </View>
            </View>

            {/* Content Text (English or Urdu dynamically) */}
            <View style={styles.textContainer}>
              <Text style={[styles.slideTitle, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>
                {language === "en" ? item.titleEn : item.titleUr}
              </Text>
              <Text style={[styles.slideDesc, { color: colors.mutedForeground, lineHeight: 22, fontSize: language === "en" ? 14 : 15 }]}>
                {language === "en" ? item.descEn : item.descUr}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Lower Navigation Controls */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        {/* Dot Indicators */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, idx) => {
            const isSelected = activeIndex === idx;
            return (
              <View
                key={idx}
                style={[
                  styles.dot,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.border,
                    width: isSelected ? 20 : 8,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          {activeIndex === SLIDES.length - 1 ? (
            <TouchableOpacity
              style={[styles.finishBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
              onPress={handleFinish}
              activeOpacity={0.85}
            >
              <Text style={styles.finishBtnText}>
                {language === "en" ? "Get Started" : "شروع کریں"}
              </Text>
              <Feather name="arrow-right" size={16} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, { backgroundColor: colors.primary }]}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {language === "en" ? "Next" : "آگے"}
              </Text>
              <Feather name="chevron-right" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    zIndex: 10,
    gap: 10,
  },
  langSwitcher: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  langText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  volumeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      }
    })
  },
  skipBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  skipBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  slideWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 36,
  },
  circleArt: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  innerCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    width: "100%",
    gap: 12,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  slideTitle: {
    fontSize: 22,
    textAlign: "center",
  },
  slideDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingHorizontal: 10,
  },
  footer: {
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 24,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  btnRow: {
    width: "100%",
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  nextBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  finishBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  finishBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
});
