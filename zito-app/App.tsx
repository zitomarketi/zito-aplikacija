import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useEffect, useState, type ReactNode } from "react";
import {
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

type TabParamList = {
  Home: undefined;
  Flyers: undefined;
  Card: undefined;
  Notifications: undefined;
  Profile: undefined;
};

type User = {
  id: string;
  name: string;
  email: string;
  points: number;
  coupons: number;
  cardNumber: string;
};

type Flyer = {
  id: string;
  title: string;
  price: string;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type CardData = {
  cardNumber: string;
  barcode: string;
  qrValue: string;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const DEFAULT_API_BASE =
  (Constants.expoConfig?.extra?.apiBase as string | undefined) ||
  (Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000");
const OAUTH_REDIRECT_URI = "zitoapp://oauth/callback";

const fallbackUser: User = {
  id: "u1",
  name: "Жито Корисник",
  email: "korisnik@zito.mk",
  points: 1280,
  coupons: 4,
  cardNumber: "6899512",
};

const fallbackFlyers: Flyer[] = [
  { id: "f1", title: "Овошје и зеленчук", price: "49 ден." },
  { id: "f2", title: "Пијалоци", price: "99 ден." },
  { id: "f3", title: "Млечни производи", price: "119 ден." },
  { id: "f4", title: "Слатки и грицки", price: "79 ден." },
];

const fallbackNotices: Notice[] = [
  { id: "n1", title: "Жито", body: "Нов Жито леток е објавен.", createdAt: "пред 5 минути" },
  { id: "n2", title: "Специјална понуда", body: "20% попуст за лојални корисници.", createdAt: "денес" },
];

const fallbackCard: CardData = {
  cardNumber: "6899512",
  barcode: "6899512",
  qrValue: "ZITO:6899512:u1",
};

const colors = {
  bg: "#E9E9E9",
  card: "#FFFFFF",
  green: "#0A8F43",
  dark: "#111111",
  gray: "#505050",
  border: "#D7D7D7",
};

const logoImage = require("./assets/images/logo.png");
const tiltedBadgeImage = require("./assets/images/sekogasverninavas_upscaled-removebg-preview.png");
const bannerImage = require("./assets/images/home_banner.png");
const flyersImage = require("./assets/images/flyers_grid.png");

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function apiGet<T>(baseUrl: string, path: string, token?: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`GET ${path} failed`);
  return (await res.json()) as T;
}

async function apiPost<T>(baseUrl: string, path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `POST ${path} failed`);
  }
  return (await res.json()) as T;
}

function LoginScreen({
  onEmailLogin,
  onRegister,
  onSocial,
  error,
}: {
  onEmailLogin: (email: string, password: string) => void;
  onRegister: (name: string, email: string, password: string) => void;
  onSocial: (provider: "google" | "facebook") => void;
  error: string;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("korisnik@zito.mk");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoY, setLogoY] = useState<number | null>(null);
  const badgeTop = logoY == null ? 62 : Math.max(0, logoY / 2 - 30 + 38);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.loginWrap}>
        <Image source={tiltedBadgeImage} style={[styles.tiltedBadgeImage, { top: badgeTop }]} resizeMode="contain" />
        <Image
          source={logoImage}
          style={styles.logoImage}
          resizeMode="contain"
          onLayout={(e) => setLogoY(e.nativeEvent.layout.y)}
        />
        <Text style={styles.loginTitle}>{mode === "login" ? "НАЈАВА" : "РЕГИСТРАЦИЈА"}</Text>

        {mode === "register" ? (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Име и Презиме"
            placeholderTextColor="#9A9A9A"
            style={styles.input}
          />
        ) : null}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor="#9A9A9A"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={(text) => setPassword(text.replace(/[\u200E\u200F\u202A-\u202E]/g, ""))}
            placeholder="Лозинка"
            placeholderTextColor="#9A9A9A"
            style={[styles.input, styles.passwordInput]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            multiline={false}
            textAlign="left"
            cursorColor="#111111"
            selectionColor="#111111"
            autoComplete={mode === "login" ? "password" : "new-password"}
            textContentType={mode === "login" ? "password" : "newPassword"}
            importantForAutofill="yes"
            secureTextEntry={!showPassword}
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((prev) => !prev)}>
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#6E6E6E"
            />
          </Pressable>
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() =>
            mode === "login"
              ? onEmailLogin(email.trim(), password)
              : onRegister(name.trim(), email.trim(), password)
          }
        >
          <Text style={styles.primaryBtnText}>{mode === "login" ? "Најава со email" : "Креирај профил"}</Text>
        </Pressable>

        <Pressable style={styles.switchBtn} onPress={() => setMode(mode === "login" ? "register" : "login")}>
          <Text style={styles.switchBtnText}>
            {mode === "login" ? "Немаш профил? Регистрирај се" : "Имаш профил? Најави се"}
          </Text>
        </Pressable>

        <LoginBtn
          icon={<Ionicons name="logo-google" size={20} color="#4285F4" />}
          text="Најава со Google"
          onPress={() => onSocial("google")}
        />
        <LoginBtn
          icon={<Ionicons name="logo-facebook" size={20} color="#1877F2" />}
          text="Најава со Facebook"
          onPress={() => onSocial("facebook")}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

function LoginBtn({
  icon,
  text,
  onPress,
}: {
  icon: ReactNode;
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.loginBtn} onPress={onPress}>
      {icon}
      <Text style={styles.loginBtnText}>{text}</Text>
    </Pressable>
  );
}

function HomeScreen({ user }: { user: User }) {
  return (
    <ScreenWrap title="Жито апликација" subtitle="Банери, новости и понуди">
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Нови летоци</Text>
        <Text style={styles.bannerText}>Погледни ги најновите неделни акции</Text>
      </View>
      <Image source={bannerImage} style={styles.heroBanner} resizeMode="cover" />
      <View style={styles.infoRow}>
        <InfoCard title="Поени" value={`${user.points}`} />
        <InfoCard title="Купони" value={`${user.coupons} активни`} />
      </View>
    </ScreenWrap>
  );
}

function FlyersScreen({ flyers }: { flyers: Flyer[] }) {
  return (
    <ScreenWrap title="Дигитални флаери" subtitle="Истакнати производи и топ акции">
      <FlatList
        data={flyers}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
        renderItem={({ item }) => (
          <View style={styles.flyerCard}>
            <Image source={flyersImage} style={styles.flyerThumb} resizeMode="cover" />
            <Text style={styles.flyerTitle}>{item.title}</Text>
            <Text style={styles.flyerPrice}>{item.price}</Text>
          </View>
        )}
      />
    </ScreenWrap>
  );
}

function CardScreen({ card }: { card: CardData }) {
  return (
    <ScreenWrap title="Дигитална картичка" subtitle="Жито Клуб">
      <View style={styles.cardBox}>
        <Image source={logoImage} style={styles.cardLogo} resizeMode="contain" />
        <Text style={styles.cardNumber}>{card.cardNumber}</Text>
        <View style={styles.barcodeWrap}>
          <Text style={styles.barcodeText}>{card.barcode}</Text>
        </View>
        <View style={styles.qrWrap}>
          <QRCode value={card.qrValue} size={130} />
        </View>
      </View>
    </ScreenWrap>
  );
}

function NotificationsScreen({ notices }: { notices: Notice[] }) {
  return (
    <ScreenWrap title="Нотификации" subtitle="Директна и навремена комуникација">
      {notices.map((notice) => (
        <View key={notice.id} style={styles.notificationCard}>
          <Text style={styles.notificationTitle}>{notice.title}</Text>
          <Text style={styles.notificationBody}>{notice.body}</Text>
          <Text style={styles.notificationTime}>{notice.createdAt}</Text>
        </View>
      ))}
    </ScreenWrap>
  );
}

function ProfileScreen({
  user,
  pushToken,
  pushState,
  onRegisterPush,
  onRefresh,
  onLogout,
}: {
  user: User;
  pushToken: string;
  pushState: string;
  onRegisterPush: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  return (
    <ScreenWrap title="Профил" subtitle="Управување со сметка">
      <InfoCard title="Име" value={user.name} />
      <InfoCard title="Email" value={user.email} />
      <InfoCard title="Push статус" value={pushState} />
      <InfoCard title="Push токен" value={pushToken || "Нема токен"} />
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onRegisterPush}>
        <Ionicons name="notifications-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>Регистрирај push</Text>
      </Pressable>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onRefresh}>
        <MaterialIcons name="refresh" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>Освежи податоци</Text>
      </Pressable>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>Одјава</Text>
      </Pressable>
    </ScreenWrap>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ScreenWrap({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const tabBarHeight = useBottomTabBarHeight();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarHeight + 20 },
        ]}
      >
        <Text style={styles.screenTitle}>{title}</Text>
        <Text style={styles.screenSubtitle}>{subtitle}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function MainTabs({
  user,
  flyers,
  notices,
  card,
  pushToken,
  pushState,
  onRegisterPush,
  onRefresh,
  onLogout,
}: {
  user: User;
  flyers: Flyer[];
  notices: Notice[];
  card: CardData;
  pushToken: string;
  pushState: string;
  onRegisterPush: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const tabBottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 10 : 8);
  const tabHeight = 56 + tabBottomPadding;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: "#606060",
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          height: tabHeight,
          paddingBottom: tabBottomPadding,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 14,
          marginBottom: 1,
          includeFontPadding: false,
        },
        tabBarIcon: ({ color, size }) => {
          const map: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: "home",
            Flyers: "pricetags",
            Card: "card",
            Notifications: "notifications",
            Profile: "person",
          };
          return <Ionicons name={map[route.name as keyof TabParamList]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" options={{ title: "Почетна" }}>
        {() => <HomeScreen user={user} />}
      </Tab.Screen>
      <Tab.Screen name="Flyers" options={{ title: "Летоци" }}>
        {() => <FlyersScreen flyers={flyers} />}
      </Tab.Screen>
      <Tab.Screen name="Card" options={{ title: "Картичка" }}>
        {() => <CardScreen card={card} />}
      </Tab.Screen>
      <Tab.Screen name="Notifications" options={{ title: "Известувања" }}>
        {() => <NotificationsScreen notices={notices} />}
      </Tab.Screen>
      <Tab.Screen name="Profile" options={{ title: "Профил" }}>
        {() => (
          <ProfileScreen
            user={user}
            pushToken={pushToken}
            pushState={pushState}
            onRegisterPush={onRegisterPush}
            onRefresh={onRefresh}
            onLogout={onLogout}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

async function registerForPush(): Promise<string> {
  if (!Device.isDevice) return "Push работи на физички уред.";
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return "Нема дозвола за push notifications.";

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }
  return token.data;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authError, setAuthError] = useState("");
  const apiBase = DEFAULT_API_BASE;

  const [user, setUser] = useState<User>(fallbackUser);
  const [flyers, setFlyers] = useState<Flyer[]>(fallbackFlyers);
  const [notices, setNotices] = useState<Notice[]>(fallbackNotices);
  const [card, setCard] = useState<CardData>(fallbackCard);
  const [pushToken, setPushToken] = useState("");
  const [pushState, setPushState] = useState("Нерегистрирано");

  const consumeOAuthCallback = async (url: string) => {
    if (!url.startsWith(OAUTH_REDIRECT_URI)) return;
    const queryString = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const params = new URLSearchParams(queryString);
    const token = params.get("token");
    const oauthError = params.get("error");

    if (oauthError) {
      setAuthError("OAuth најавата не успеа. Пробај повторно.");
      return;
    }
    if (!token) return;

    try {
      setAuthError("");
      setAuthToken(token);
      setLoggedIn(true);
      await loadData(token);
    } catch {
      setAuthError("OAuth најавата успеа, но backend податоците не се достапни.");
    }
  };

  const loadData = async (token: string) => {
    const [nextUser, nextFlyers, nextNotices, nextCard] = await Promise.all([
      apiGet<User>(apiBase, "/me", token),
      apiGet<Flyer[]>(apiBase, "/flyers", token),
      apiGet<Notice[]>(apiBase, "/notifications", token),
      apiGet<CardData>(apiBase, "/loyalty/card", token),
    ]);
    setUser(nextUser);
    setFlyers(nextFlyers);
    setNotices(nextNotices);
    setCard(nextCard);
  };

  useEffect(() => {
    if (!loggedIn || !authToken) return;
    void loadData(authToken).catch(() => {
      setPushState("Backend моментално недостапен.");
    });
  }, [loggedIn, authToken]);

  useEffect(() => {
    const sub = Linking.addEventListener("url", (event) => {
      void consumeOAuthCallback(event.url);
    });
    Linking.getInitialURL().then((url) => {
      if (url) void consumeOAuthCallback(url);
    }).catch(() => {
      // Ignore initial URL errors.
    });
    return () => sub.remove();
  }, []);

  const handleEmailLogin = async (email: string, password: string) => {
    try {
      setAuthError("");
      const res = await apiPost<{ token: string; user: User }>(apiBase, "/auth/login", { email, password });
      setAuthToken(res.token);
      setUser(res.user);
      setLoggedIn(true);
      await loadData(res.token);
    } catch {
      if (email.toLowerCase() === "korisnik@zito.mk" && password === "password123") {
        setAuthToken("");
        setUser(fallbackUser);
        setFlyers(fallbackFlyers);
        setNotices(fallbackNotices);
        setCard(fallbackCard);
        setPushState("Офлајн демо режим");
        setLoggedIn(true);
        return;
      }
      setAuthError("Невалидна најава. Пробај повторно.");
    }
  };

  const handleRegister = async (name: string, email: string, password: string) => {
    try {
      setAuthError("");
      const res = await apiPost<{ token: string; user: User }>(apiBase, "/auth/register", { name, email, password });
      setAuthToken(res.token);
      setUser(res.user);
      setLoggedIn(true);
      await loadData(res.token);
    } catch {
      setAuthError("Регистрацијата не успеа. Провери email/password.");
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    try {
      setAuthError("");
      if (!apiBase.startsWith("http://") && !apiBase.startsWith("https://")) {
        setAuthError("Внеси валиден Backend URL (http/https).");
        return;
      }
      const oauthStartUrl =
        `${apiBase}/auth/oauth/${provider}/start?redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}`;
      await Linking.openURL(oauthStartUrl);
    } catch {
      setAuthError("Не можам да започнам OAuth најава на овој уред.");
    }
  };

  const handlePushRegister = async () => {
    try {
      const token = await registerForPush();
      if (token.startsWith("ExponentPushToken[")) {
        setPushToken(token);
        setPushState("Push токен генериран");
        if (authToken) {
          await apiPost(apiBase, "/push/register", { token }, authToken);
        }
      } else {
        setPushState(token);
      }
    } catch {
      setPushState("Грешка при push регистрација.");
    }
  };

  const handleRefresh = async () => {
    if (!authToken) return;
    try {
      await loadData(authToken);
      setPushState("Освежено");
    } catch {
      setPushState("Не можам да освежам податоци.");
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setAuthToken("");
    setAuthError("");
    setPushToken("");
    setPushState("Нерегистрирано");
    setUser(fallbackUser);
    setFlyers(fallbackFlyers);
    setNotices(fallbackNotices);
    setCard(fallbackCard);
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!loggedIn ? (
          <RootStack.Screen name="Login">
            {() => (
              <LoginScreen
                onEmailLogin={handleEmailLogin}
                onRegister={handleRegister}
                onSocial={handleSocialLogin}
                error={authError}
              />
            )}
          </RootStack.Screen>
        ) : (
          <RootStack.Screen name="Main">
            {() => (
              <MainTabs
                user={user}
                flyers={flyers}
                notices={notices}
                card={card}
                pushToken={pushToken}
                pushState={pushState}
                onRegisterPush={handlePushRegister}
                onRefresh={handleRefresh}
                onLogout={handleLogout}
              />
            )}
          </RootStack.Screen>
        )}
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: 18,
    gap: 14,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.dark,
  },
  screenSubtitle: {
    fontSize: 15,
    color: colors.gray,
    marginBottom: 4,
  },
  logoImage: {
    alignSelf: "center",
    width: 170,
    height: 100,
    marginBottom: 8,
    zIndex: 2,
    elevation: 2,
  },
  tiltedBadgeImage: {
    position: "absolute",
    alignSelf: "center",
    width: 250,
    height: 60,
    transform: [{ rotate: "-10deg" }],
    zIndex: 1,
    elevation: 1,
  },
  loginWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: "#111111",
    fontSize: 17,
    textAlign: "left",
    writingDirection: "ltr",
  },
  passwordWrap: {
    position: "relative",
    marginBottom: 10,
  },
  passwordInput: {
    marginBottom: 0,
    paddingRight: 44,
    color: "#111111",
    fontSize: 18,
    textAlign: "left",
    writingDirection: "ltr",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 11,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  loginTitle: {
    textAlign: "center",
    fontSize: 30,
    fontWeight: "900",
    color: colors.green,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: colors.green,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  switchBtn: {
    alignItems: "center",
    marginBottom: 12,
  },
  switchBtnText: {
    color: colors.green,
    fontWeight: "700",
  },
  loginBtn: {
    backgroundColor: "#F8F8F8",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loginBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2D2D2D",
  },
  errorText: {
    color: "#BF2020",
    textAlign: "center",
    fontWeight: "700",
  },
  banner: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderLeftWidth: 6,
    borderLeftColor: colors.green,
    padding: 16,
  },
  heroBanner: {
    width: "100%",
    height: 170,
    borderRadius: 16,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.dark,
    marginBottom: 6,
  },
  bannerText: {
    fontSize: 15,
    color: colors.gray,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  infoTitle: {
    color: colors.gray,
    fontSize: 13,
  },
  infoValue: {
    color: colors.dark,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  flyerCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  flyerThumb: {
    borderRadius: 10,
    width: "100%",
    height: 90,
    marginBottom: 10,
  },
  flyerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.dark,
  },
  flyerPrice: {
    color: colors.green,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
  },
  cardBox: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardLogo: {
    width: 110,
    height: 56,
    alignSelf: "center",
    marginBottom: 8,
  },
  cardNumber: {
    textAlign: "center",
    fontSize: 18,
    color: colors.gray,
    marginBottom: 12,
  },
  barcodeWrap: {
    backgroundColor: "#FCFCFC",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 14,
  },
  barcodeText: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "900",
    color: colors.dark,
    letterSpacing: 2,
  },
  qrWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  notificationCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 14,
  },
  notificationTitle: {
    fontWeight: "900",
    fontSize: 17,
    color: colors.dark,
  },
  notificationBody: {
    marginTop: 4,
    color: colors.gray,
    fontSize: 15,
  },
  notificationTime: {
    marginTop: 8,
    color: colors.green,
    fontWeight: "700",
  },
});
