import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator, useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import RNBlobUtil from "react-native-blob-util";
import Pdf from "react-native-pdf";
import Svg, { Circle, G } from "react-native-svg";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";

type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

type TabParamList = {
  Home: undefined;
  Flyers: undefined;
  Card: undefined;
  PriceCheck: undefined;
  Shopping: undefined;
  Locations: undefined;
  Notifications: undefined;
  Profile: undefined;
  More: undefined;
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
  image?: string;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  kind?: "text" | "image" | "pdf";
  mediaUrl?: string;
  thumbnailUrl?: string;
};

type CardData = {
  cardNumber: string;
  barcode: string;
  qrValue: string;
};

type ProductPrice = {
  barcode: string;
  name: string;
  price: string;
  currency: string;
  unit: string;
  updatedAt: string;
};

type PurchaseItem = {
  brKasa: string;
  brojSka: string;
  datumSka: string;
  imeArt: string;
  kolicina: string;
  vrednost: string;
  imeOrg?: string;
};

type ApkGalleryItem = {
  id: string;
  label: string;
  file: string;
  imageUrl: string;
  thumbnailUrl?: string;
  isPdf?: boolean;
};

type ApkGalleryPayload = {
  currentFlyers: ApkGalleryItem[];
  bestDeals: ApkGalleryItem[];
};

type HomeTopItem = {
  file: string;
  mimeType: string;
  imageUrl: string;
  updatedAt: string;
};

type HomeTopPayload = {
  item: HomeTopItem | null;
};

type MarketLocation = {
  name: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
};

type ShoppingItem = {
  id: string;
  name: string;
  quantity: string;
  note: string;
  done: boolean;
  createdAt: number;
};

type ThemeMode = "light" | "dark";
type LanguageCode = "mk" | "en" | "sq" | "tr";
const HEADLINE_COLOR = "#1F5D3A";
const HEADLINE_OUTLINE_COLOR = "#1F5D3A";
const HEADLINE_OUTLINE_RADIUS = 0;
const DARK_HEADLINE_COLOR = "#FFFFFF";
type ThemePalette = {
  bg: string;
  card: string;
  green: string;
  text: string;
  muted: string;
  border: string;
  inputBg: string;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const FALLBACK_API_BASE = "https://zito-cms-backend.onrender.com";
const SESSION_TOKEN_KEY = "zito.session.token";
const THEME_MODE_KEY = "zito.theme.mode";
const LANGUAGE_CODE_KEY = "zito.language.code";
const SHOPPING_LIST_KEY = "zito.shopping.items";
const configuredApiBase = String(Constants.expoConfig?.extra?.apiBase || "").trim();
const isLocalApiBase = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(\/|$)/i.test(configuredApiBase);
const DEFAULT_API_BASE = !configuredApiBase || isLocalApiBase ? FALLBACK_API_BASE : configuredApiBase;
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

type CurrentFlyerMock = {
  id: string;
  title: string;
  price: string;
  image?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  isPdf?: boolean;
};

type BestDealItem = {
  id: string;
  title: string;
  price: string;
  image?: number;
  imageUrl?: string;
  linkUrl?: string;
};

const currentFlyersMock: CurrentFlyerMock[] = [
  { id: "c1", title: "Тест леток 1", price: "", image: require("./assets/images/letoci/OIP.webp") },
  { id: "c2", title: "Тест леток 2", price: "", image: require("./assets/images/letoci/OIP (1).webp") },
  { id: "c3", title: "Тест леток 3", price: "", image: require("./assets/images/letoci/OIP (2).webp") },
  { id: "c4", title: "Тест леток 4", price: "", image: require("./assets/images/letoci/OIP (3).webp") },
  { id: "c5", title: "Тест леток 5", price: "", image: require("./assets/images/letoci/OIP (4).webp") },
  { id: "c6", title: "Тест леток 6", price: "", image: require("./assets/images/letoci/tip-4-566x800.png") },
];

const colors = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  green: "#0A8F43",
  dark: "#111111",
  gray: "#505050",
  border: "#D7D7D7",
};

const LIGHT_THEME: ThemePalette = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  green: "#0A8F43",
  text: "#111111",
  muted: "#505050",
  border: "#D7D7D7",
  inputBg: "#FCFCFC",
};

const DARK_THEME: ThemePalette = {
  bg: "#121212",
  card: "#1B1B1B",
  green: "#31B564",
  text: "#F3F3F3",
  muted: "#B4B4B4",
  border: "#2F2F2F",
  inputBg: "#242424",
};

const ThemeContext = createContext<{
  mode: ThemeMode;
  palette: ThemePalette;
  toggleTheme: () => void;
}>({
  mode: "light",
  palette: LIGHT_THEME,
  toggleTheme: () => {},
});

function useAppTheme() {
  return useContext(ThemeContext);
}

const I18N: Record<LanguageCode, Record<string, string>> = {
  mk: {
    loading_profile: "Се вчитува профил...",
    login: "НАЈАВА",
    register: "РЕГИСТРАЦИЈА",
    name_placeholder: "Име и Презиме",
    email_placeholder: "Е-пошта",
    loyalty_placeholder: "Број на лојална картичка (опционално)",
    password_placeholder: "Лозинка",
    login_email_btn: "Најава со email",
    create_profile_btn: "Креирај профил",
    no_profile: "Немаш профил? Регистрирај се",
    has_profile: "Имаш профил? Најави се",
    login_google: "Најава со Google",
    login_facebook: "Најава со Facebook",
    scan_barcode_camera: "Скенирај баркод со камера",
    scan_barcode_title: "Скенирај баркод од лојална картичка",
    scan_barcode_hint: "Порамни го баркодот во средина на камерата.",
    cancel: "Откажи",
    camera_permission_error: "Нема дозвола за камера. Овозможи Camera permission во Settings.",
    invalid_barcode: "Невалиден баркод. Пробај повторно.",
    barcode_success: "Баркод успешно скениран.",
    state_card_saved: "Картичката е ажурирана.",
    state_card_invalid: "Невалиден број на картичка.",
    state_card_linked: "Оваа картичка е веќе поврзана со друг профил.",
    state_card_error: "Грешка при ажурирање на картичка.",
    state_card_service_unavailable: "Сервисот за картичка моментално не е достапен.",
    state_card_deleted: "Картичката е избришана.",
    card_delete_button: "Избриши картичка",
    card_points_title: "Поени",
    card_purchases_title: "Купени продукти",
    card_purchases_empty: "Нема пазарувања за приказ.",
    card_loading: "Се вчитува...",
    home_current_flyers: "ТЕКОВНИ ЛЕТОЦИ",
    home_best_deals: "НАЈДОБРИ АКЦИИ",
    best_deal_super_price: "Супер цена!",
    points: "Поени",
    coupons: "Купони",
    active_suffix: "активни",
    tag_zito: "ЖИТО",
    tag_action: "АКЦИЈА",
    tab_home: "Почетна",
    tab_flyers: "Летоци",
    tab_card: "Лојална",
    tab_prices: "Цени",
    tab_shopping: "Листа",
    tab_locations: "Локации",
    tab_notifications: "Известувања",
    tab_profile: "Профил",
    tab_more: "Повеќе",
    screen_flyers_title: "Дигитални флаери",
    screen_flyers_subtitle: "Анализа на купувања и категории",
    flyers_analytics_title: "Анализа на купувања",
    flyers_date_from: "Од датум (YYYY-MM-DD)",
    flyers_date_to: "До датум (YYYY-MM-DD)",
    flyers_clear_filter: "Исчисти филтер",
    flyers_total_spent: "Вкупно потрошено",
    flyers_total_items: "Вкупно парчиња",
    flyers_total_receipts: "Број на сметки",
    flyers_category_chart_title: "Потрошувачка по категории",
    flyers_recent_purchases: "Купени производи",
    flyers_no_card: "Нема поврзана картичка. Додади картичка во табот Лојална.",
    flyers_no_data: "Нема податоци за избраниот период.",
    screen_card_title: "Лојална",
    screen_card_subtitle: "Жито Клуб",
    screen_prices_title: "Проверка на цена",
    screen_prices_subtitle: "Скенирај баркод за моментална цена",
    screen_shopping_title: "Шопинг листа",
    screen_shopping_subtitle: "Организирај производи пред купување",
    screen_locations_title: "Локации",
    screen_locations_subtitle: "Интерактивни GPS локации по населено место",
    locations_all: "Сите",
    screen_notifications_title: "Нотификации",
    screen_notifications_subtitle: "Директна и навремена комуникација",
    screen_profile_title: "Профил",
    screen_profile_subtitle: "Управување со сметка",
    screen_more_title: "More",
    screen_more_subtitle: "Брз пристап до останати секции",
    name_label: "Име",
    email_label: "Е-пошта",
    push_status_label: "Push статус",
    profile_basic_section: "Основни податоци",
    profile_password_section: "Ресетирање лозинка",
    current_password_label: "Тековна лозинка",
    new_password_label: "Нова лозинка",
    confirm_password_label: "Потврди нова лозинка",
    save_profile: "Сними податоци",
    change_password: "Смени лозинка",
    profile_status_label: "Статус",
    push_token_label: "Push токен",
    no_token: "Нема токен",
    register_push: "Регистрирај push",
    send_test_push: "Тест push нотификација",
    refresh_data: "Освежи податоци",
    price_scan_btn: "Скенирај продукт баркод",
    price_input_placeholder: "Внеси баркод",
    price_check_btn: "Провери цена",
    price_result_title: "Моментална цена",
    price_barcode_label: "Баркод",
    price_updated_label: "Ажурирано",
    price_not_found: "Производот не е пронајден.",
    price_invalid: "Невалиден баркод.",
    price_lookup_error: "Грешка при проверка на цена.",
    open_shopping_list: "Отвори шопинг листа",
    shopping_item_placeholder: "Производ",
    shopping_qty_placeholder: "Кол.",
    shopping_note_placeholder: "Белешка (опционално)",
    shopping_add_btn: "Додај",
    shopping_clear_checked: "Исчисти купено",
    shopping_empty: "Нема производи. Додај прв производ.",
    open_in_maps: "Отвори во мапа",
    no_coordinates: "Нема GPS координати",
    coordinates_label: "Координати",
    locations_search_placeholder: "Пребарај маркет, адреса или населено место",
    locations_find_nearest: "Најблизок маркет",
    locations_nearest_found: "Најблизок е",
    locations_gps_unavailable: "GPS не е достапен на уредот.",
    locations_gps_permission: "Нема GPS дозвола или локацијата е исклучена.",
    locations_gps_no_markets: "Нема маркети со GPS координати за пребарување.",
    locations_no_results: "Нема резултати за пребарувањето.",
    logout: "Одјава",
    language: "Јазик",
    lang_mk: "Македонски",
    lang_en: "English",
    lang_sq: "Shqip",
    lang_tr: "Türkçe",
    push_physical_device: "Push работи на физички уред.",
    push_no_permission: "Нема дозвола за push notifications.",
    push_missing_project_id: "Push не е конфигуриран (недостасува EAS projectId).",
    push_missing_firebase: "Push не е конфигуриран (недостасува Firebase google-services.json).",
    state_unregistered: "Нерегистрирано",
    state_backend_unavailable: "Backend моментално недостапен.",
    state_offline_demo: "Офлајн демо режим",
    state_push_token_generated: "Push токен генериран",
    state_push_test_sent: "Тест push е испратен.",
    state_push_register_first: "Прво регистрирај push токен.",
    state_push_error: "Грешка при push регистрација.",
    state_refreshed: "Освежено",
    state_refresh_error: "Не можам да освежам податоци.",
    state_profile_saved: "Основните податоци се снимени.",
    state_profile_email_exists: "Оваа е-пошта веќе постои.",
    state_profile_error: "Не можам да ги снимам основните податоци.",
    state_password_changed: "Лозинката е успешно сменета.",
    state_password_error: "Не можам да ја сменам лозинката.",
    state_password_mismatch: "Новата лозинка и потврдата не се совпаѓаат.",
    state_password_too_short: "Новата лозинка мора да има најмалку 6 карактери.",
    state_current_password_invalid: "Тековната лозинка е невалидна.",
    auth_oauth_failed: "OAuth најавата не успеа. Пробај повторно.",
    auth_oauth_data_missing: "OAuth најавата успеа, но backend податоците не се достапни.",
    auth_invalid_login: "Невалидна најава. Пробај повторно.",
    auth_card_linked: "Оваа лојална картичка е веќе поврзана со друг профил.",
    auth_card_invalid: "Невалиден формат на број на лојална картичка.",
    auth_register_failed: "Регистрацијата не успеа. Провери ги податоците.",
    auth_invalid_backend_url: "Внеси валиден Backend URL (http/https).",
    auth_oauth_start_failed: "Не можам да започнам OAuth најава на овој уред.",
  },
  en: {
    loading_profile: "Loading profile...",
    login: "LOGIN",
    register: "REGISTER",
    name_placeholder: "Full Name",
    email_placeholder: "Email",
    loyalty_placeholder: "Loyalty card number (optional)",
    password_placeholder: "Password",
    login_email_btn: "Login with email",
    create_profile_btn: "Create profile",
    no_profile: "No profile? Register",
    has_profile: "Already have profile? Login",
    login_google: "Login with Google",
    login_facebook: "Login with Facebook",
    scan_barcode_camera: "Scan barcode with camera",
    scan_barcode_title: "Scan loyalty card barcode",
    scan_barcode_hint: "Align barcode in the camera center.",
    cancel: "Cancel",
    camera_permission_error: "No camera permission. Enable Camera permission in Settings.",
    invalid_barcode: "Invalid barcode. Try again.",
    barcode_success: "Barcode scanned successfully.",
    state_card_saved: "Card updated successfully.",
    state_card_invalid: "Invalid loyalty card number.",
    state_card_linked: "This card is already linked to another profile.",
    state_card_error: "Could not update card.",
    state_card_service_unavailable: "Loyalty card service is currently unavailable.",
    state_card_deleted: "Card deleted.",
    card_delete_button: "Delete card",
    card_points_title: "Points",
    card_purchases_title: "Purchased products",
    card_purchases_empty: "No purchases to display.",
    card_loading: "Loading...",
    home_current_flyers: "CURRENT FLYERS",
    home_best_deals: "BEST DEALS",
    best_deal_super_price: "Super price!",
    points: "Points",
    coupons: "Coupons",
    active_suffix: "active",
    tag_zito: "ZITO",
    tag_action: "DEAL",
    tab_home: "Home",
    tab_flyers: "Flyers",
    tab_card: "Card",
    tab_prices: "Prices",
    tab_shopping: "List",
    tab_locations: "Locations",
    tab_notifications: "Alerts",
    tab_profile: "Profile",
    tab_more: "More",
    screen_flyers_title: "Digital Flyers",
    screen_flyers_subtitle: "Shopping analytics and categories",
    flyers_analytics_title: "Shopping analytics",
    flyers_date_from: "From date (YYYY-MM-DD)",
    flyers_date_to: "To date (YYYY-MM-DD)",
    flyers_clear_filter: "Clear filter",
    flyers_total_spent: "Total spent",
    flyers_total_items: "Total quantity",
    flyers_total_receipts: "Receipts",
    flyers_category_chart_title: "Spend by category",
    flyers_recent_purchases: "Purchased products",
    flyers_no_card: "No linked card. Add a card in the Card tab.",
    flyers_no_data: "No data for the selected period.",
    screen_card_title: "Digital Card",
    screen_card_subtitle: "Zito Club",
    screen_prices_title: "Price Check",
    screen_prices_subtitle: "Scan barcode for current in-store price",
    screen_shopping_title: "Shopping List",
    screen_shopping_subtitle: "Organize products before shopping",
    screen_locations_title: "Locations",
    screen_locations_subtitle: "Interactive GPS locations by settlement",
    locations_all: "All",
    screen_notifications_title: "Notifications",
    screen_notifications_subtitle: "Direct and timely communication",
    screen_profile_title: "Profile",
    screen_profile_subtitle: "Account management",
    screen_more_title: "More",
    screen_more_subtitle: "Quick access to other sections",
    name_label: "Name",
    email_label: "Email",
    push_status_label: "Push status",
    profile_basic_section: "Basic details",
    profile_password_section: "Reset password",
    current_password_label: "Current password",
    new_password_label: "New password",
    confirm_password_label: "Confirm new password",
    save_profile: "Save details",
    change_password: "Change password",
    profile_status_label: "Status",
    push_token_label: "Push token",
    no_token: "No token",
    register_push: "Register push",
    send_test_push: "Send test push",
    refresh_data: "Refresh data",
    price_scan_btn: "Scan product barcode",
    price_input_placeholder: "Enter barcode",
    price_check_btn: "Check price",
    price_result_title: "Current price",
    price_barcode_label: "Barcode",
    price_updated_label: "Updated",
    price_not_found: "Product not found.",
    price_invalid: "Invalid barcode.",
    price_lookup_error: "Price lookup failed.",
    open_shopping_list: "Open shopping list",
    shopping_item_placeholder: "Product",
    shopping_qty_placeholder: "Qty",
    shopping_note_placeholder: "Note (optional)",
    shopping_add_btn: "Add",
    shopping_clear_checked: "Clear purchased",
    shopping_empty: "No products yet. Add your first product.",
    open_in_maps: "Open in Maps",
    no_coordinates: "No GPS coordinates",
    coordinates_label: "Coordinates",
    locations_search_placeholder: "Search market, address or settlement",
    locations_find_nearest: "Nearest market",
    locations_nearest_found: "Nearest is",
    locations_gps_unavailable: "GPS is not available on this device.",
    locations_gps_permission: "GPS permission denied or location is turned off.",
    locations_gps_no_markets: "No markets with GPS coordinates available.",
    locations_no_results: "No results found for this search.",
    logout: "Logout",
    language: "Language",
    lang_mk: "Macedonian",
    lang_en: "English",
    lang_sq: "Albanian",
    lang_tr: "Turkish",
    push_physical_device: "Push works on a physical device.",
    push_no_permission: "No push notification permission.",
    push_missing_project_id: "Push is not configured (missing EAS projectId).",
    push_missing_firebase: "Push is not configured (missing Firebase google-services.json).",
    state_unregistered: "Not registered",
    state_backend_unavailable: "Backend is currently unavailable.",
    state_offline_demo: "Offline demo mode",
    state_push_token_generated: "Push token generated",
    state_push_test_sent: "Test push sent.",
    state_push_register_first: "Register push token first.",
    state_push_error: "Push registration error.",
    state_refreshed: "Refreshed",
    state_refresh_error: "Could not refresh data.",
    state_profile_saved: "Basic details saved.",
    state_profile_email_exists: "This email already exists.",
    state_profile_error: "Could not save basic details.",
    state_password_changed: "Password changed successfully.",
    state_password_error: "Could not change password.",
    state_password_mismatch: "New password and confirmation do not match.",
    state_password_too_short: "New password must be at least 6 characters.",
    state_current_password_invalid: "Current password is invalid.",
    auth_oauth_failed: "OAuth login failed. Try again.",
    auth_oauth_data_missing: "OAuth login succeeded, but backend data is unavailable.",
    auth_invalid_login: "Invalid login. Try again.",
    auth_card_linked: "This loyalty card is already linked to another profile.",
    auth_card_invalid: "Invalid loyalty card number format.",
    auth_register_failed: "Registration failed. Check your data.",
    auth_invalid_backend_url: "Enter a valid Backend URL (http/https).",
    auth_oauth_start_failed: "Cannot start OAuth login on this device.",
  },
  sq: {
    loading_profile: "Duke ngarkuar profilin...",
    login: "HYRJE",
    register: "REGJISTRIM",
    name_placeholder: "Emri dhe Mbiemri",
    email_placeholder: "Email",
    loyalty_placeholder: "Numri i karteles së besnikërisë (opsionale)",
    password_placeholder: "Fjalëkalimi",
    login_email_btn: "Hyr me email",
    create_profile_btn: "Krijo profil",
    no_profile: "Nuk ke profil? Regjistrohu",
    has_profile: "Ke profil? Hyr",
    login_google: "Hyr me Google",
    login_facebook: "Hyr me Facebook",
    scan_barcode_camera: "Skano barkodin me kamerë",
    scan_barcode_title: "Skano barkodin e karteles së besnikërisë",
    scan_barcode_hint: "Vendose barkodin në qendër të kamerës.",
    cancel: "Anulo",
    camera_permission_error: "Nuk ka leje për kamerën. Aktivizo Camera permission në Settings.",
    invalid_barcode: "Barkod i pavlefshëm. Provo përsëri.",
    barcode_success: "Barkodi u skanua me sukses.",
    state_card_saved: "Kartela u perditesua.",
    state_card_invalid: "Numer i pavlefshem i karteles.",
    state_card_linked: "Kjo kartele eshte tashme e lidhur me nje profil tjeter.",
    state_card_error: "Nuk mund te perditesoj kartelen.",
    state_card_service_unavailable: "Sherbimi i karteles nuk eshte i disponueshem tani.",
    state_card_deleted: "Kartela u fshi.",
    card_delete_button: "Fshi kartelen",
    card_points_title: "Pike",
    card_purchases_title: "Produkte te blera",
    card_purchases_empty: "Nuk ka blerje per t'u shfaqur.",
    card_loading: "Duke ngarkuar...",
    home_current_flyers: "LETËR NJOFTIME AKTIVE",
    home_best_deals: "AKSIONET MË TË MIRA",
    best_deal_super_price: "Super cmim!",
    points: "Pikë",
    coupons: "Kuponë",
    active_suffix: "aktive",
    tag_zito: "ZHITO",
    tag_action: "AKSION",
    tab_home: "Kreu",
    tab_flyers: "Fletë",
    tab_card: "Kartela",
    tab_prices: "Cmimet",
    tab_shopping: "Lista",
    tab_locations: "Lokacione",
    tab_notifications: "Njoftime",
    tab_profile: "Profili",
    tab_more: "More",
    screen_flyers_title: "Fletë Digjitale",
    screen_flyers_subtitle: "Analize e blerjeve dhe kategorive",
    flyers_analytics_title: "Analize e blerjeve",
    flyers_date_from: "Nga data (YYYY-MM-DD)",
    flyers_date_to: "Deri me (YYYY-MM-DD)",
    flyers_clear_filter: "Pastro filtrin",
    flyers_total_spent: "Totali i shpenzuar",
    flyers_total_items: "Sasia totale",
    flyers_total_receipts: "Numri i faturave",
    flyers_category_chart_title: "Shpenzimi sipas kategorive",
    flyers_recent_purchases: "Produktet e blera",
    flyers_no_card: "Nuk ka kartele te lidhur. Shto kartele te tab-i Kartela.",
    flyers_no_data: "Nuk ka te dhena per periudhen e zgjedhur.",
    screen_card_title: "Kartelë Digjitale",
    screen_card_subtitle: "Zito Klub",
    screen_prices_title: "Kontrollo cmimin",
    screen_prices_subtitle: "Skano barkodin per cmimin aktual",
    screen_shopping_title: "Lista e blerjes",
    screen_shopping_subtitle: "Organizo produktet para blerjes",
    screen_locations_title: "Lokacione",
    screen_locations_subtitle: "Lokacione interaktive GPS sipas vendbanimit",
    locations_all: "Te gjitha",
    screen_notifications_title: "Njoftime",
    screen_notifications_subtitle: "Komunikim i drejtpërdrejtë dhe në kohë",
    screen_profile_title: "Profili",
    screen_profile_subtitle: "Menaxhim i llogarisë",
    screen_more_title: "More",
    screen_more_subtitle: "Qasje e shpejte te seksionet e tjera",
    name_label: "Emri",
    email_label: "Email",
    push_status_label: "Statusi i push",
    profile_basic_section: "Të dhënat bazë",
    profile_password_section: "Rivendos fjalëkalimin",
    current_password_label: "Fjalëkalimi aktual",
    new_password_label: "Fjalëkalimi i ri",
    confirm_password_label: "Konfirmo fjalëkalimin e ri",
    save_profile: "Ruaj të dhënat",
    change_password: "Ndrysho fjalëkalimin",
    profile_status_label: "Statusi",
    push_token_label: "Push token",
    no_token: "Nuk ka token",
    register_push: "Regjistro push",
    send_test_push: "Dergo push test",
    refresh_data: "Rifresko të dhënat",
    price_scan_btn: "Skano barkodin e produktit",
    price_input_placeholder: "Shkruaj barkodin",
    price_check_btn: "Kontrollo cmimin",
    price_result_title: "Cmimi aktual",
    price_barcode_label: "Barkodi",
    price_updated_label: "Perditesuar",
    price_not_found: "Produkti nuk u gjet.",
    price_invalid: "Barkod i pavlefshem.",
    price_lookup_error: "Gabim ne kontrollin e cmimit.",
    open_shopping_list: "Hap listen e blerjes",
    shopping_item_placeholder: "Produkti",
    shopping_qty_placeholder: "Sasia",
    shopping_note_placeholder: "Shenim (opsionale)",
    shopping_add_btn: "Shto",
    shopping_clear_checked: "Pastro te blerat",
    shopping_empty: "Nuk ka produkte. Shto produktin e pare.",
    open_in_maps: "Hap në Maps",
    no_coordinates: "Nuk ka koordinata GPS",
    coordinates_label: "Koordinata",
    locations_search_placeholder: "Kerko market, adrese ose vendbanim",
    locations_find_nearest: "Marketi me i afert",
    locations_nearest_found: "Me i aferti eshte",
    locations_gps_unavailable: "GPS nuk eshte i disponueshem ne kete pajisje.",
    locations_gps_permission: "Leja per GPS mungon ose lokacioni eshte i fikur.",
    locations_gps_no_markets: "Nuk ka markete me koordinata GPS.",
    locations_no_results: "Nuk u gjet asnje rezultat.",
    logout: "Dil",
    language: "Gjuha",
    lang_mk: "Maqedonisht",
    lang_en: "Anglisht",
    lang_sq: "Shqip",
    lang_tr: "Turqisht",
    push_physical_device: "Push funksionon në pajisje fizike.",
    push_no_permission: "Nuk ka leje për njoftime push.",
    push_missing_project_id: "Push nuk eshte konfiguruar (mungon EAS projectId).",
    push_missing_firebase: "Push nuk eshte konfiguruar (mungon Firebase google-services.json).",
    state_unregistered: "I paregjistruar",
    state_backend_unavailable: "Backend për momentin i padisponueshëm.",
    state_offline_demo: "Modalitet demo offline",
    state_push_token_generated: "Push token i gjeneruar",
    state_push_test_sent: "Push test u dergua.",
    state_push_register_first: "Se pari regjistro push token.",
    state_push_error: "Gabim gjatë regjistrimit push.",
    state_refreshed: "U rifreskua",
    state_refresh_error: "Nuk mund të rifreskoj të dhënat.",
    state_profile_saved: "Të dhënat bazë u ruajtën.",
    state_profile_email_exists: "Ky email ekziston tashmë.",
    state_profile_error: "Nuk mund t'i ruaj të dhënat bazë.",
    state_password_changed: "Fjalëkalimi u ndryshua me sukses.",
    state_password_error: "Nuk mund të ndryshoj fjalëkalimin.",
    state_password_mismatch: "Fjalëkalimi i ri dhe konfirmimi nuk përputhen.",
    state_password_too_short: "Fjalëkalimi i ri duhet të ketë së paku 6 karaktere.",
    state_current_password_invalid: "Fjalëkalimi aktual është i pavlefshëm.",
    auth_oauth_failed: "Hyrja OAuth dështoi. Provo përsëri.",
    auth_oauth_data_missing: "Hyrja OAuth u krye, por të dhënat backend mungojnë.",
    auth_invalid_login: "Hyrje e pavlefshme. Provo përsëri.",
    auth_card_linked: "Kjo kartelë është e lidhur me një profil tjetër.",
    auth_card_invalid: "Format i pavlefshëm i numrit të kartelës.",
    auth_register_failed: "Regjistrimi dështoi. Kontrollo të dhënat.",
    auth_invalid_backend_url: "Shkruaj URL të vlefshme të Backend-it (http/https).",
    auth_oauth_start_failed: "Nuk mund të nis OAuth hyrjen në këtë pajisje.",
  },
  tr: {
    loading_profile: "Profil yükleniyor...",
    login: "GIRIS",
    register: "KAYIT",
    name_placeholder: "Ad Soyad",
    email_placeholder: "E-posta",
    loyalty_placeholder: "Sadakat karti numarasi (opsiyonel)",
    password_placeholder: "Sifre",
    login_email_btn: "E-posta ile giris",
    create_profile_btn: "Profil olustur",
    no_profile: "Profilin yok mu? Kayit ol",
    has_profile: "Profilin var mi? Giris yap",
    login_google: "Google ile giris",
    login_facebook: "Facebook ile giris",
    scan_barcode_camera: "Kamerayla barkod tara",
    scan_barcode_title: "Sadakat karti barkodunu tara",
    scan_barcode_hint: "Barkodu kameranin ortasina hizala.",
    cancel: "Iptal",
    camera_permission_error: "Kamera izni yok. Ayarlardan Camera permission etkinlestir.",
    invalid_barcode: "Gecersiz barkod. Tekrar dene.",
    barcode_success: "Barkod basariyla tarandi.",
    state_card_saved: "Kart basariyla guncellendi.",
    state_card_invalid: "Gecersiz sadakat karti numarasi.",
    state_card_linked: "Bu kart baska bir profile bagli.",
    state_card_error: "Kart guncellenemedi.",
    state_card_service_unavailable: "Kart servisi su anda kullanilamiyor.",
    state_card_deleted: "Kart silindi.",
    card_delete_button: "Karti sil",
    card_points_title: "Puanlar",
    card_purchases_title: "Satin alinan urunler",
    card_purchases_empty: "Gosterilecek alisveris yok.",
    card_loading: "Yukleniyor...",
    home_current_flyers: "GUNCEL BROSURLER",
    home_best_deals: "EN IYI AKSIYONLAR",
    best_deal_super_price: "Super fiyat!",
    points: "Puanlar",
    coupons: "Kuponlar",
    active_suffix: "aktif",
    tag_zito: "ZITO",
    tag_action: "AKSIYON",
    tab_home: "Ana Sayfa",
    tab_flyers: "Brosurler",
    tab_card: "Kart",
    tab_prices: "Fiyat",
    tab_shopping: "Liste",
    tab_locations: "Konumlar",
    tab_notifications: "Bildirimler",
    tab_profile: "Profil",
    tab_more: "More",
    screen_flyers_title: "Dijital Brosurler",
    screen_flyers_subtitle: "Alisveris analizi ve kategoriler",
    flyers_analytics_title: "Alisveris analizi",
    flyers_date_from: "Baslangic (YYYY-MM-DD)",
    flyers_date_to: "Bitis (YYYY-MM-DD)",
    flyers_clear_filter: "Filtreyi temizle",
    flyers_total_spent: "Toplam harcama",
    flyers_total_items: "Toplam adet",
    flyers_total_receipts: "Fis sayisi",
    flyers_category_chart_title: "Kategoriye gore harcama",
    flyers_recent_purchases: "Satin alinan urunler",
    flyers_no_card: "Bagli kart yok. Kart sekmesinden kart ekleyin.",
    flyers_no_data: "Secilen aralik icin veri yok.",
    screen_card_title: "Dijital Kart",
    screen_card_subtitle: "Zito Kulup",
    screen_prices_title: "Fiyat kontrolu",
    screen_prices_subtitle: "Guncel fiyat icin barkod tara",
    screen_shopping_title: "Alisveris listesi",
    screen_shopping_subtitle: "Alisveris oncesi urunleri duzenle",
    screen_locations_title: "Konumlar",
    screen_locations_subtitle: "Yerlesim yerine gore etkilesimli GPS konumlari",
    locations_all: "Tum",
    screen_notifications_title: "Bildirimler",
    screen_notifications_subtitle: "Dogrudan ve zamaninda iletisim",
    screen_profile_title: "Profil",
    screen_profile_subtitle: "Hesap yonetimi",
    screen_more_title: "More",
    screen_more_subtitle: "Diger bolumlere hizli erisim",
    name_label: "Ad",
    email_label: "E-posta",
    push_status_label: "Push durumu",
    profile_basic_section: "Temel bilgiler",
    profile_password_section: "Sifre sifirlama",
    current_password_label: "Mevcut sifre",
    new_password_label: "Yeni sifre",
    confirm_password_label: "Yeni sifreyi dogrula",
    save_profile: "Bilgileri kaydet",
    change_password: "Sifreyi degistir",
    profile_status_label: "Durum",
    push_token_label: "Push token",
    no_token: "Token yok",
    register_push: "Push kaydet",
    send_test_push: "Test push gonder",
    refresh_data: "Veriyi yenile",
    price_scan_btn: "Urun barkodu tara",
    price_input_placeholder: "Barkod gir",
    price_check_btn: "Fiyati kontrol et",
    price_result_title: "Guncel fiyat",
    price_barcode_label: "Barkod",
    price_updated_label: "Guncellendi",
    price_not_found: "Urun bulunamadi.",
    price_invalid: "Gecersiz barkod.",
    price_lookup_error: "Fiyat kontrolu basarisiz.",
    open_shopping_list: "Alisveris listesini ac",
    shopping_item_placeholder: "Urun",
    shopping_qty_placeholder: "Adet",
    shopping_note_placeholder: "Not (opsiyonel)",
    shopping_add_btn: "Ekle",
    shopping_clear_checked: "Alinanlari temizle",
    shopping_empty: "Henuz urun yok. Ilk urunu ekle.",
    open_in_maps: "Haritada ac",
    no_coordinates: "GPS koordinati yok",
    coordinates_label: "Koordinatlar",
    locations_search_placeholder: "Market, adres veya yerlesim ara",
    locations_find_nearest: "En yakin market",
    locations_nearest_found: "En yakin",
    locations_gps_unavailable: "Bu cihazda GPS kullanilamiyor.",
    locations_gps_permission: "GPS izni yok veya konum kapali.",
    locations_gps_no_markets: "GPS koordinatli market bulunamadi.",
    locations_no_results: "Bu arama icin sonuc yok.",
    logout: "Cikis",
    language: "Dil",
    lang_mk: "Makedonca",
    lang_en: "Ingilizce",
    lang_sq: "Arnavutca",
    lang_tr: "Turkce",
    push_physical_device: "Push fiziksel cihazda calisir.",
    push_no_permission: "Push bildirimi izni yok.",
    push_missing_project_id: "Push yapilandirilmamis (EAS projectId eksik).",
    push_missing_firebase: "Push yapilandirilmamis (Firebase google-services.json eksik).",
    state_unregistered: "Kayitli degil",
    state_backend_unavailable: "Backend su an kullanilamiyor.",
    state_offline_demo: "Cevrimdisi demo modu",
    state_push_token_generated: "Push token olusturuldu",
    state_push_test_sent: "Test push gonderildi.",
    state_push_register_first: "Once push token kaydet.",
    state_push_error: "Push kayit hatasi.",
    state_refreshed: "Yenilendi",
    state_refresh_error: "Veriler yenilenemedi.",
    state_profile_saved: "Temel bilgiler kaydedildi.",
    state_profile_email_exists: "Bu e-posta zaten var.",
    state_profile_error: "Temel bilgiler kaydedilemedi.",
    state_password_changed: "Sifre basariyla degistirildi.",
    state_password_error: "Sifre degistirilemedi.",
    state_password_mismatch: "Yeni sifre ve dogrulama ayni degil.",
    state_password_too_short: "Yeni sifre en az 6 karakter olmali.",
    state_current_password_invalid: "Mevcut sifre gecersiz.",
    auth_oauth_failed: "OAuth girisi basarisiz. Tekrar dene.",
    auth_oauth_data_missing: "OAuth girisi basarili ancak backend verisi kullanilamiyor.",
    auth_invalid_login: "Gecersiz giris. Tekrar dene.",
    auth_card_linked: "Bu sadakat karti baska bir profile bagli.",
    auth_card_invalid: "Sadakat karti numarasi formati gecersiz.",
    auth_register_failed: "Kayit basarisiz. Bilgileri kontrol et.",
    auth_invalid_backend_url: "Gecerli Backend URL gir (http/https).",
    auth_oauth_start_failed: "Bu cihazda OAuth girisi baslatilamiyor.",
  },
};

const LOGIN_LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string }> = [
  { code: "mk", label: "MK" },
  { code: "en", label: "EN" },
  { code: "sq", label: "SQ" },
  { code: "tr", label: "TR" },
];

const I18nContext = createContext<{
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string) => string;
}>({
  language: "mk",
  setLanguage: () => {},
  t: (key: string) => key,
});

function useI18n() {
  return useContext(I18nContext);
}

const logoImage = require("./assets/images/logo.png");
const topBrandLogoImage = require("./assets/images/zitobaner.png");
const tiltedBadgeImage = require("./assets/images/sekogasverninavas_upscaled-removebg-preview.png");
const bannerImage = require("./assets/images/home_banner.png");
const flyersImage = require("./assets/images/flyers_grid.png");
const cardBackImage = require("./assets/kartickazadna.png");
// Location data refresh marker: 2026-03-06T12:05
const rawMarketLocations = require("./assets/market_locations.json") as MarketLocation[];
const marketLocations: MarketLocation[] = rawMarketLocations.map((item) => ({
  name: String(item.name || "").trim(),
  city: String(item.city || "").trim() || "Останати",
  address: String(item.address || "").trim(),
  lat: typeof item.lat === "number" ? item.lat : null,
  lng: typeof item.lng === "number" ? item.lng : null,
}));

const CITY_ALIASES: Array<{ city: string; aliases: string[] }> = [
  { city: "Велес", aliases: ["велес", "veles"] },
  { city: "Скопје", aliases: ["скопје", "skopje"] },
  { city: "Куманово", aliases: ["куманово", "kumanovo"] },
  { city: "Тетово", aliases: ["тетово", "tetovo"] },
  { city: "Кочани", aliases: ["кочани", "kocani"] },
  { city: "Прилеп", aliases: ["прилеп", "prilep"] },
  { city: "Штип", aliases: ["штип", "stip"] },
  { city: "Битола", aliases: ["битола", "bitola"] },
  { city: "Струмица", aliases: ["струмица", "strumica"] },
  { city: "Кавадарци", aliases: ["кавадарци", "kavadarci"] },
  { city: "Виница", aliases: ["виница", "vinica"] },
  { city: "Делчево", aliases: ["делчево", "delcevo"] },
  { city: "Гевгелија", aliases: ["гевгелија", "gevgelija"] },
  { city: "Кичево", aliases: ["кичево", "kicevo"] },
  { city: "Гостивар", aliases: ["гостивар", "gostivar"] },
  { city: "Неготино", aliases: ["неготино", "negotino"] },
  { city: "Валандово", aliases: ["валандово", "valandovo"] },
  { city: "Росоман", aliases: ["росоман", "rosoman"] },
  { city: "Демир Капија", aliases: ["демир капија", "demir kapija"] },
  { city: "Свети Николе", aliases: ["свети николе", "sveti nikole"] },
  { city: "Пробиштип", aliases: ["пробиштип", "probistip"] },
  { city: "Петровец", aliases: ["петровец", "petrovec"] },
  { city: "Илинден", aliases: ["илинден", "ilinden"] },
  { city: "Драчево", aliases: ["драчево", "dracevo"] },
];

function resolveMarketCity(item: MarketLocation): string {
  const raw = item.city.trim();
  if (raw && raw !== "Останати") return raw;
  const haystack = `${item.name} ${item.address}`.toLowerCase();
  for (const entry of CITY_ALIASES) {
    if (entry.aliases.some((alias) => haystack.includes(alias))) return entry.city;
  }
  return "Останати";
}

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthKm * c;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
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

async function apiDelete<T>(baseUrl: string, path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `DELETE ${path} failed`);
  }
  return (await res.json()) as T;
}

function extractApiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "";
  try {
    const parsed = JSON.parse(error.message);
    if (parsed && Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      const firstError = parsed.errors.find((value: unknown) => typeof value === "string");
      if (typeof firstError === "string" && firstError.trim()) return firstError.trim();
    }
    if (parsed && typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail.trim();
    if (parsed && typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
  } catch {
    // Ignore parse errors and keep fallback.
  }
  return error.message || "";
}

function LoginScreen({
  onEmailLogin,
  onRegister,
  onSocial,
  error,
  language,
  onSetLanguage,
}: {
  onEmailLogin: (email: string, password: string) => void;
  onRegister: (name: string, email: string, password: string, loyaltyCardNumber: string) => void;
  onSocial: (provider: "google" | "facebook") => void;
  error: string;
  language: LanguageCode;
  onSetLanguage: (language: LanguageCode) => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("korisnik@zito.mk");
  const [password, setPassword] = useState("");
  const [loyaltyCardNumber, setLoyaltyCardNumber] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [logoY, setLogoY] = useState<number | null>(null);
  const badgeTop = logoY == null ? 62 : Math.max(0, logoY / 2 - 30 + 38);

  const handleOpenScanner = async () => {
    setScanStatus("");
    setScanLocked(false);
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setScanStatus(t("camera_permission_error"));
        return;
      }
    }
    setIsScannerOpen(true);
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    const digits = String(data || "").replace(/\D/g, "");
    if (!digits) {
      setScanStatus(t("invalid_barcode"));
      setScanLocked(false);
      return;
    }
    setLoyaltyCardNumber(digits.slice(0, 16));
    setScanStatus(t("barcode_success"));
    setIsScannerOpen(false);
  };

  if (isScannerOpen) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
        <View style={styles.scannerWrap}>
          <CameraView
            style={styles.scannerCamera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "itf14"],
            }}
            onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerTitle}>{t("scan_barcode_title")}</Text>
            <Text style={styles.scannerHint}>{t("scan_barcode_hint")}</Text>
            <Pressable style={styles.scannerCloseBtn} onPress={() => setIsScannerOpen(false)}>
              <Text style={styles.scannerCloseBtnText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={styles.loginWrap}>
        <Image source={tiltedBadgeImage} style={[styles.tiltedBadgeImage, { top: badgeTop }]} resizeMode="contain" />
        <Image
          source={logoImage}
          style={styles.logoImage}
          resizeMode="contain"
          onLayout={(e) => setLogoY(e.nativeEvent.layout.y)}
        />
        <Text style={[styles.loginTitle, { color: palette.green }]}>{mode === "login" ? t("login") : t("register")}</Text>

        {mode === "register" ? (
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("name_placeholder")}
            placeholderTextColor="#9A9A9A"
            style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
          />
        ) : null}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={t("email_placeholder")}
          placeholderTextColor="#9A9A9A"
          style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        {mode === "register" ? (
          <>
            <TextInput
              value={loyaltyCardNumber}
              onChangeText={(text) => setLoyaltyCardNumber(text.replace(/\D/g, ""))}
              placeholder={t("loyalty_placeholder")}
              placeholderTextColor="#9A9A9A"
              style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
              keyboardType="number-pad"
              textContentType="none"
              maxLength={16}
            />
            <Pressable style={styles.scanBtn} onPress={() => void handleOpenScanner()}>
              <Ionicons name="scan-outline" size={18} color={colors.green} />
              <Text style={styles.scanBtnText}>{t("scan_barcode_camera")}</Text>
            </Pressable>
            {scanStatus ? <Text style={styles.scanStatusText}>{scanStatus}</Text> : null}
          </>
        ) : null}
        <View style={styles.passwordWrap}>
          <TextInput
            value={password}
            onChangeText={(text) => setPassword(text.replace(/[\u200E\u200F\u202A-\u202E]/g, ""))}
            placeholder={t("password_placeholder")}
            placeholderTextColor="#9A9A9A"
            style={[styles.input, styles.passwordInput, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
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
            color={palette.muted}
            />
          </Pressable>
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() =>
            mode === "login"
              ? onEmailLogin(email.trim(), password)
              : onRegister(name.trim(), email.trim(), password, loyaltyCardNumber.trim())
          }
        >
          <Text style={styles.primaryBtnText}>{mode === "login" ? t("login_email_btn") : t("create_profile_btn")}</Text>
        </Pressable>

        <Pressable style={styles.switchBtn} onPress={() => setMode(mode === "login" ? "register" : "login")}>
          <Text style={styles.switchBtnText}>
            {mode === "login" ? t("no_profile") : t("has_profile")}
          </Text>
        </Pressable>

        <LoginBtn
          icon={<Ionicons name="logo-google" size={20} color="#4285F4" />}
          text={t("login_google")}
          onPress={() => onSocial("google")}
        />
        <LoginBtn
          icon={<Ionicons name="logo-facebook" size={20} color="#1877F2" />}
          text={t("login_facebook")}
          onPress={() => onSocial("facebook")}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
      <View style={[styles.loginLangDock, { bottom: Math.max(insets.bottom, 8) }]}>
        <View style={[styles.loginLangRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {LOGIN_LANGUAGE_OPTIONS.map((option) => (
            <Pressable
              key={option.code}
              style={({ pressed }) => [
                styles.loginLangChip,
                language === option.code
                  ? styles.loginLangChipActive
                  : { backgroundColor: palette.inputBg, borderColor: palette.border },
                pressed && styles.loginLangChipPressed,
              ]}
              onPress={() => onSetLanguage(option.code)}
            >
              <Text
                style={[
                  styles.loginLangText,
                  { color: language === option.code ? "#FFFFFF" : palette.muted },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
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
  const { palette } = useAppTheme();
  return (
    <Pressable style={[styles.loginBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={onPress}>
      {icon}
      <Text style={[styles.loginBtnText, { color: palette.text }]}>{text}</Text>
    </Pressable>
  );
}

function BarcodeStrip({ value, height = 64 }: { value: string; height?: number }) {
  const normalized = (value || "").replace(/\D/g, "") || "000000";
  const bars: number[] = [];

  for (let i = 0; i < normalized.length; i += 1) {
    const digit = Number(normalized[i]) || 0;
    bars.push(2, 1);
    for (let j = 0; j < 5; j += 1) {
      bars.push((digit + j) % 2 === 0 ? 2 : 1);
    }
    bars.push(1);
  }

  return (
    <View style={[styles.barcodeCanvas, { height }]}>
      {bars.map((w, idx) => (
        <View key={`${idx}-${w}`} style={[styles.barcodeBar, { width: w + 1 }]} />
      ))}
    </View>
  );
}

function HomeScreen({
  currentFlyers,
  bestDeals,
  homeTopItem,
  shoppingItems,
  onAddShoppingItem,
  onOpenShoppingList,
}: {
  currentFlyers: CurrentFlyerMock[];
  bestDeals: BestDealItem[];
  homeTopItem: HomeTopItem | null;
  shoppingItems: ShoppingItem[];
  onAddShoppingItem: (name: string, quantity: string, note: string) => void;
  onOpenShoppingList: () => void;
}) {
  const { mode, palette, toggleTheme } = useAppTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const showcaseSectionHeight = Math.max(236, Math.min(302, Math.floor(windowHeight * 0.325)));
  const currentCardHeight = Math.max(138, showcaseSectionHeight - 92);
  const currentCardWidth = Math.max(112, Math.min(164, Math.round(currentCardHeight * 0.78)));
  const currentFlyersGap = 10;
  const currentFlyersItemSize = currentCardWidth + currentFlyersGap;
  const currentFlyersData = currentFlyers;
  const baseFlyersCount = currentFlyersData.length;
  const endlessFlyers = useMemo(
    () => [...currentFlyersData, ...currentFlyersData, ...currentFlyersData],
    [currentFlyersData],
  );
  const flyersListRef = useRef<FlatList<CurrentFlyerMock> | null>(null);
  const [homeTopAspectRatio, setHomeTopAspectRatio] = useState(16 / 6);
  const [activePdfUrl, setActivePdfUrl] = useState("");
  const [pdfLoadProgress, setPdfLoadProgress] = useState(0);
  const [pdfLoadError, setPdfLoadError] = useState("");
  const [cachedPdfUrls, setCachedPdfUrls] = useState<Record<string, string>>({});
  const bestDealRows = useMemo(() => {
    const rows: BestDealItem[][] = [];
    for (let i = 0; i < bestDeals.length; i += 2) {
      rows.push(bestDeals.slice(i, i + 2));
    }
    return rows;
  }, [bestDeals]);

  const shoppingSet = useMemo(
    () => new Set(shoppingItems.map((item) => item.name.trim().toLowerCase()).filter(Boolean)),
    [shoppingItems],
  );

  useEffect(() => {
    let cancelled = false;
    const cachePdfFiles = async () => {
      const pdfUrls = Array.from(
        new Set(
          currentFlyersData
            .map((item) => normalizeExternalFlyerUrl(item.imageUrl))
            .filter((url) => Boolean(url) && /\.pdf($|\?)/i.test(String(url))),
        ),
      ) as string[];
      if (!pdfUrls.length) return;

      const nextEntries: Record<string, string> = {};
      for (const url of pdfUrls) {
        if (cachedPdfUrls[url]) continue;
        try {
          const localPath = getPdfCacheUri(url);
          if (!localPath) continue;
          const exists = await RNBlobUtil.fs.exists(localPath);
          if (!exists) {
            await RNBlobUtil.config({ path: localPath, fileCache: true }).fetch("GET", url);
          }
          nextEntries[url] = `file://${localPath}`;
        } catch {
          // Keep remote URL fallback.
        }
      }

      if (!cancelled && Object.keys(nextEntries).length > 0) {
        setCachedPdfUrls((prev) => ({ ...prev, ...nextEntries }));
      }
    };

    void cachePdfFiles();
    return () => {
      cancelled = true;
    };
  }, [currentFlyersData, cachedPdfUrls]);

  const openCurrentFlyer = async (item: CurrentFlyerMock) => {
    const targetUrl = normalizeExternalFlyerUrl(item.imageUrl);
    if (!targetUrl) return;
    const safeUrl = encodeURI(targetUrl);
    const isPdf = Boolean(item.isPdf || /\.pdf($|\?)/i.test(targetUrl));
    if (isPdf) {
      setPdfLoadProgress(0);
      setPdfLoadError("");
      setActivePdfUrl(cachedPdfUrls[targetUrl] || safeUrl);
      return;
    }
    try {
      const canOpen = await Linking.canOpenURL(safeUrl);
      if (!canOpen) return;
      await Linking.openURL(safeUrl);
    } catch {
      // Ignore URL open failures.
    }
  };

  const openBestDeal = async (item: BestDealItem) => {
    const targetUrl = normalizeExternalFlyerUrl(item.linkUrl || item.imageUrl);
    if (!targetUrl) return;
    try {
      await Linking.openURL(encodeURI(targetUrl));
    } catch {
      // Ignore URL open failures.
    }
  };

  useEffect(() => {
    const targetIndex = baseFlyersCount;
    const timer = setTimeout(() => {
      flyersListRef.current?.scrollToIndex({ index: targetIndex, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [baseFlyersCount, currentFlyersItemSize]);

  const recenterFlyersIfNeeded = (offsetX: number) => {
    const rawIndex = Math.round(offsetX / currentFlyersItemSize);
    if (rawIndex < baseFlyersCount) {
      flyersListRef.current?.scrollToIndex({ index: rawIndex + baseFlyersCount, animated: false });
      return;
    }
    if (rawIndex >= baseFlyersCount * 2) {
      flyersListRef.current?.scrollToIndex({ index: rawIndex - baseFlyersCount, animated: false });
    }
  };

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.homeTopBrandBar, { height: insets.top + 74 }]}>
        <Image source={topBrandLogoImage} style={styles.homeTopBrandLogo} resizeMode="contain" />
        <Pressable style={[styles.themeToggleBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={toggleTheme}>
          <Ionicons
            name={mode === "light" ? "moon-outline" : "sunny-outline"}
            size={18}
            color={palette.green}
          />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={[styles.homeScrollContent, { paddingBottom: insets.bottom + 84 }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.homeFixedWrap}>
        {homeTopItem?.imageUrl ? (
          <View style={[styles.homeTopFieldWrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Image
              source={{ uri: homeTopItem.imageUrl }}
              style={[styles.homeTopFieldImage, { aspectRatio: homeTopAspectRatio }]}
              resizeMode="contain"
              onLoad={(event) => {
                const width = Number(event.nativeEvent?.source?.width || 0);
                const height = Number(event.nativeEvent?.source?.height || 0);
                if (width > 0 && height > 0) setHomeTopAspectRatio(width / height);
              }}
            />
          </View>
        ) : null}

        <View style={[styles.showcaseSection, { height: showcaseSectionHeight, backgroundColor: palette.card, borderColor: palette.border }]}>
          <OutlinedHeader text={t("home_current_flyers")} />
          <FlatList
            ref={flyersListRef}
            data={endlessFlyers}
            horizontal
            keyExtractor={(item, index) => `${item.id}-${index}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.currentFlyersRow}
            ItemSeparatorComponent={() => <View style={{ width: currentFlyersGap }} />}
            getItemLayout={(_, index) => ({
              length: currentFlyersItemSize,
              offset: currentFlyersItemSize * index,
              index,
            })}
            initialScrollIndex={baseFlyersCount}
            onMomentumScrollEnd={(event) => recenterFlyersIfNeeded(event.nativeEvent.contentOffset.x)}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => flyersListRef.current?.scrollToIndex({ index: info.index, animated: false }), 50);
            }}
            renderItem={({ item }) => {
              const targetUrl = normalizeExternalFlyerUrl(item.imageUrl);
              const thumbUrl = normalizeExternalFlyerUrl(item.thumbnailUrl) || derivePdfThumbnailUrl(targetUrl);
              const isPdf = Boolean(item.isPdf || (targetUrl && /\.pdf($|\?)/i.test(targetUrl)));
              const pdfUri = targetUrl ? cachedPdfUrls[targetUrl] || targetUrl : "";
              const imageSource = item.image ? item.image : targetUrl ? { uri: targetUrl } : null;
              return (
                <Pressable
                  style={[styles.currentFlyerCard, { backgroundColor: palette.card, width: currentCardWidth, height: currentCardHeight }]}
                  onPress={targetUrl ? () => void openCurrentFlyer(item) : undefined}
                >
                  {isPdf && targetUrl ? (
                    <View style={styles.currentFlyerPdfCard}>
                      {thumbUrl ? (
                        <Image source={{ uri: thumbUrl }} style={styles.currentFlyerPdfWebView} resizeMode="contain" />
                      ) : (
                        <Pdf
                          source={{ uri: pdfUri, cache: true }}
                          style={styles.currentFlyerPdfWebView}
                          page={1}
                          singlePage
                          fitPolicy={0}
                          trustAllCerts={false}
                        />
                      )}
                      <View style={styles.currentFlyerPdfBadge}>
                        <MaterialIcons name="picture-as-pdf" size={14} color="#FFFFFF" />
                        <Text style={styles.currentFlyerPdfBadgeText}>PDF</Text>
                      </View>
                    </View>
                  ) : imageSource ? (
                    <Image source={imageSource} style={styles.currentFlyerImage} resizeMode="contain" />
                  ) : (
                    <View style={styles.currentFlyerPdfCard}>
                      <Text style={styles.currentFlyerPdfLabel}>No Image</Text>
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>

        <View style={[styles.showcaseSection, styles.bestDealsSection, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <OutlinedHeader text={t("home_best_deals")} />
          <View style={styles.bestDealsGrid}>
            {bestDealRows.map((row, idx) => (
              <View key={`best-row-${idx}`} style={styles.bestDealsRow}>
                {row.map((item) => {
                  const inList = shoppingSet.has(String(item.title || "").trim().toLowerCase());
                  return (
                  <View
                    key={item.id}
                    style={[styles.bestDealCard, { backgroundColor: "#F8F8F8" }]}
                  >
                    <Pressable
                      style={styles.bestDealHeartBtn}
                      onPress={() => onAddShoppingItem(item.title || "Акција", "1", "")}
                    >
                      <Ionicons name={inList ? "heart" : "heart-outline"} size={20} color="#0A8F43" />
                    </Pressable>
                    <Pressable style={styles.bestDealMainBtn} onPress={() => void openBestDeal(item)}>
                    <View style={styles.bestDealImageWrap}>
                      {item.image ? (
                        <Image source={item.image} style={styles.bestDealImage} resizeMode="contain" />
                      ) : item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.bestDealImage} resizeMode="contain" />
                      ) : null}
                    </View>
                    <View style={styles.bestDealInfoWrap}>
                      <Text numberOfLines={2} style={styles.bestDealName}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.bestDealSub}>
                        {item.price || "Акција"}
                      </Text>
                      <View style={styles.bestDealBottomRow}>
                        <View style={styles.bestDealBadgeWrap}>
                          <Text style={styles.bestDealBadgePrice}>{item.price || "АКЦИЈА"}</Text>
                        </View>
                      </View>
                    </View>
                    </Pressable>
                  </View>
                )})}
              </View>
            ))}
          </View>
        </View>
        <Pressable style={[styles.quickListBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={onOpenShoppingList}>
          <Ionicons name="basket-outline" size={18} color={colors.green} />
          <Text style={styles.quickListBtnText}>{t("open_shopping_list")}</Text>
        </Pressable>
      </View>
      </ScrollView>
      <Modal visible={Boolean(activePdfUrl)} animationType="slide" transparent={false} onRequestClose={() => setActivePdfUrl("")}>
        <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
          <View style={[styles.pdfModalHeader, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.pdfModalTitle, { color: palette.text }]}>Леток PDF</Text>
            <Pressable
              style={styles.pdfModalCloseBtn}
              onPress={() => {
                setActivePdfUrl("");
                setPdfLoadProgress(0);
                setPdfLoadError("");
              }}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={[styles.pdfProgressWrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.pdfProgressTrack}>
              <View style={[styles.pdfProgressFill, { width: `${Math.max(0, Math.min(100, pdfLoadProgress))}%` }]} />
            </View>
            <Text style={[styles.pdfProgressText, { color: palette.muted }]}>
              {pdfLoadError ? `Грешка: ${pdfLoadError}` : `Вчитување PDF: ${Math.round(pdfLoadProgress)}%`}
            </Text>
          </View>
          {activePdfUrl ? (
            <Pdf
              source={{ uri: activePdfUrl, cache: true }}
              style={styles.pdfModalWebView}
              onLoadProgress={(percent: number) => {
                const next = Number.isFinite(percent) ? percent * 100 : 0;
                setPdfLoadProgress(Math.max(0, Math.min(100, next)));
              }}
              onLoadComplete={() => {
                setPdfLoadProgress(100);
                setPdfLoadError("");
              }}
              onError={(error) => {
                const message =
                  error && typeof error === "object" && "message" in error
                    ? String((error as { message?: unknown }).message || "PDF не може да се отвори")
                    : "PDF не може да се отвори";
                setPdfLoadError(message);
              }}
              trustAllCerts={false}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function OutlinedHeader({ text }: { text: string }) {
  const { palette } = useAppTheme();
  return (
    <View style={[styles.outlinedTitleWrap, { borderBottomColor: colors.green }]}>
      <Text
        style={[
          styles.showcaseHeaderMain,
          {
            color: getHeadlineColorByPalette(palette),
            textShadowColor: getHeadlineOutlineColorByPalette(palette),
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: HEADLINE_OUTLINE_RADIUS,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

function modeShadowColor(green: string) {
  return green === LIGHT_THEME.green ? "#0A5D30" : "#1E6A3A";
}

function isDarkPalette(palette: ThemePalette) {
  return palette.bg === DARK_THEME.bg || palette.text === DARK_THEME.text;
}

function getHeadlineColorByPalette(palette: ThemePalette) {
  return isDarkPalette(palette) ? DARK_HEADLINE_COLOR : HEADLINE_COLOR;
}

function getHeadlineOutlineColorByPalette(palette: ThemePalette) {
  return isDarkPalette(palette) ? "transparent" : HEADLINE_OUTLINE_COLOR;
}

function normalizeExternalFlyerUrl(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  if (raw.startsWith("/")) return `${DEFAULT_API_BASE}${raw}`;
  if (/^cms\//i.test(raw)) return `${DEFAULT_API_BASE}/${raw}`;
  return "";
}

function derivePdfThumbnailUrl(pdfUrl: string | undefined) {
  const normalized = normalizeExternalFlyerUrl(pdfUrl);
  if (!normalized || !/\.pdf($|\?)/i.test(normalized)) return "";
  const queryIndex = normalized.indexOf("?");
  const base = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  return `${base}.thumb.jpg`;
}

function hashText(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getPdfCacheUri(remoteUrl: string) {
  const baseDir = RNBlobUtil.fs.dirs.CacheDir || "";
  if (!baseDir) return "";
  return `${baseDir}/flyer-pdf-${hashText(remoteUrl)}.pdf`;
}

function normalizePurchaseDate(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const candidate = trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumberSafe(value: string) {
  const parsed = Number(String(value || "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function categorizeProduct(name: string) {
  const upper = String(name || "").toUpperCase();
  if (/(МЛЕКО|ЈОГУРТ|СИРЕЊЕ|КАШКАВАЛ|ПАВЛАКА|BUTTER|CHEESE|YOGURT|MILK)/.test(upper)) return "Млечни";
  if (/(МЕСО|САЛАМА|ПИЛЕ|КОЛБАС|ПРШУТА|BEEF|CHICKEN|MEAT|HAM|SALAMI)/.test(upper)) return "Месо";
  if (/(ВОДА|СОК|ПИВО|ВИНО|КАФЕ|ЧАЈ|COLA|JUICE|WATER|BEER|WINE|COFFEE|TEA)/.test(upper)) return "Пијалаци";
  if (/(ЛЕБ|БУРЕК|КИФЛ|ПЕЦИВО|BREAD|BAKERY|ROLL|BUN)/.test(upper)) return "Леб и пецива";
  if (/(САПУН|ШАМПОН|ДЕТЕРГЕНТ|ПАСТА|TOILET|SOAP|SHAMPOO|DETERGENT|PASTE)/.test(upper)) return "Хигиена";
  if (/(ЈАБОЛКО|БАНАН|ПОРТОКАЛ|ДОМАТ|КРАСТАВ|ПИПЕР|ОВОШ|ЗЕЛЕНЧ|APPLE|BANANA|ORANGE|TOMATO|CUCUMBER|FRUIT|VEGETABLE)/.test(upper)) return "Овошје/Зеленчук";
  return "Останато";
}

function FlyersScreen({
  card,
  onLoadPurchases,
  onLoadPoints,
  onOpenShoppingList,
}: {
  card: CardData;
  onLoadPurchases: () => Promise<PurchaseItem[]>;
  onLoadPoints: () => Promise<number>;
  onOpenShoppingList: () => void;
}) {
  const { t } = useI18n();
  const { palette } = useAppTheme();
  const [allPurchases, setAllPurchases] = useState<PurchaseItem[]>([]);
  const [points, setPoints] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showPurchases, setShowPurchases] = useState(false);
  const [activeDateField, setActiveDateField] = useState<"from" | "to" | null>(null);

  useEffect(() => {
    let active = true;
    const loadAnalytics = async () => {
      if (!card.cardNumber) {
        if (!active) return;
        setAllPurchases([]);
        setPoints(0);
        return;
      }
      setIsLoading(true);
      try {
        const [purchases, nextPoints] = await Promise.all([onLoadPurchases(), onLoadPoints()]);
        if (!active) return;
        setAllPurchases(Array.isArray(purchases) ? purchases : []);
        setPoints(Number.isFinite(nextPoints) ? nextPoints : 0);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadAnalytics();
    return () => {
      active = false;
    };
  }, [card.cardNumber, onLoadPurchases, onLoadPoints]);

  const filteredPurchases = useMemo(() => {
    const fromInput = dateFrom.trim();
    const toInput = dateTo.trim();
    const now = new Date();
    const monthStartKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    const todayKey = formatDateKey(now);
    const from = fromInput || monthStartKey;
    const to = toInput || todayKey;
    return allPurchases.filter((item) => {
      const key = normalizePurchaseDate(item.datumSka);
      if (!key) return false;
      if (from && key < from) return false;
      if (to && key > to) return false;
      return true;
    });
  }, [allPurchases, dateFrom, dateTo]);

  const analytics = useMemo(() => {
    let totalSpent = 0;
    let totalQty = 0;
    const receipts = new Set<string>();
    const byCategory = new Map<string, number>();
    const byProduct = new Map<string, number>();

    for (const item of filteredPurchases) {
      const value = toNumberSafe(item.vrednost);
      const qty = toNumberSafe(item.kolicina);
      const product = String(item.imeArt || "").trim() || "Непознато";
      const category = categorizeProduct(product);
      const receiptKey = `${item.brojSka || ""}-${item.brKasa || ""}-${normalizePurchaseDate(item.datumSka)}`;

      totalSpent += value;
      totalQty += qty;
      if (receiptKey !== "--") receipts.add(receiptKey);
      byCategory.set(category, (byCategory.get(category) || 0) + value);
      byProduct.set(product, (byProduct.get(product) || 0) + value);
    }

    const categories = Array.from(byCategory.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const topProducts = Array.from(byProduct.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return {
      totalSpent,
      totalQty,
      receipts: receipts.size,
      categories,
      topProducts,
    };
  }, [filteredPurchases]);

  const sortedPurchases = useMemo(() => {
    const toReceiptNumber = (value: string) => {
      const parsed = Number(String(value || "").replace(/[^\d]/g, ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    return [...filteredPurchases].sort((a, b) => {
      const dateA = normalizePurchaseDate(a.datumSka);
      const dateB = normalizePurchaseDate(b.datumSka);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return toReceiptNumber(b.brojSka) - toReceiptNumber(a.brojSka);
    });
  }, [filteredPurchases]);

  const pieColors = ["#0B8F45", "#1EA7FD", "#FFB300", "#E53935", "#8E24AA", "#00897B", "#6D4C41"];
  const pieSize = 170;
  const pieRadius = 62;
  const pieCirc = 2 * Math.PI * pieRadius;
  const pieTotal = analytics.categories.reduce((sum, row) => sum + row.value, 0);

  let dashOffsetAcc = 0;
  const pickerValue = useMemo(() => {
    if (activeDateField === "from") return dateFromKey(dateFrom) || new Date();
    if (activeDateField === "to") return dateFromKey(dateTo) || new Date();
    return new Date();
  }, [activeDateField, dateFrom, dateTo]);

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === "dismissed" || !selectedDate || !activeDateField) {
      setActiveDateField(null);
      return;
    }
    const key = formatDateKey(selectedDate);
    if (activeDateField === "from") {
      setDateFrom(key);
    } else {
      setDateTo(key);
    }
    setActiveDateField(null);
  };

  return (
    <ScreenWrap
      title={t("screen_flyers_title")}
      subtitle={t("screen_flyers_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <Pressable style={[styles.quickListBtn, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={onOpenShoppingList}>
        <Ionicons name="basket-outline" size={18} color={colors.green} />
        <Text style={styles.quickListBtnText}>{t("open_shopping_list")}</Text>
      </Pressable>

      <View style={[styles.analyticsCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <Text style={[styles.analyticsTitle, { color: palette.text }]}>{t("flyers_analytics_title")}</Text>
        {!card.cardNumber ? (
          <Text style={[styles.analyticsEmptyText, { color: palette.muted }]}>{t("flyers_no_card")}</Text>
        ) : (
          <>
            <View style={styles.analyticsFilterRow}>
              <Pressable
                style={[styles.analyticsDateInput, styles.analyticsDateBtn, { backgroundColor: palette.inputBg, borderColor: palette.border }]}
                onPress={() => setActiveDateField("from")}
              >
                <Text style={[styles.analyticsDateBtnText, { color: dateFrom ? palette.text : palette.muted }]}>
                  {dateFrom || t("flyers_date_from")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.analyticsDateInput, styles.analyticsDateBtn, { backgroundColor: palette.inputBg, borderColor: palette.border }]}
                onPress={() => setActiveDateField("to")}
              >
                <Text style={[styles.analyticsDateBtnText, { color: dateTo ? palette.text : palette.muted }]}>
                  {dateTo || t("flyers_date_to")}
                </Text>
              </Pressable>
            </View>
            {activeDateField ? (
              <DateTimePicker
                value={pickerValue}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleDateChange}
              />
            ) : null}
            <Pressable
              style={[styles.analyticsClearBtn, { borderColor: palette.border, backgroundColor: palette.bg }]}
              onPress={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              <Text style={[styles.analyticsClearBtnText, { color: palette.text }]}>{t("flyers_clear_filter")}</Text>
            </Pressable>

            <View style={styles.analyticsStatsGrid}>
              <View style={[styles.analyticsStatBox, { borderColor: palette.border }]}>
                <Text style={[styles.analyticsStatLabel, { color: palette.muted }]}>{t("flyers_total_spent")}</Text>
                <Text style={styles.analyticsStatValue}>{analytics.totalSpent.toFixed(2)} ден.</Text>
              </View>
              <View style={[styles.analyticsStatBox, { borderColor: palette.border }]}>
                <Text style={[styles.analyticsStatLabel, { color: palette.muted }]}>{t("flyers_total_items")}</Text>
                <Text style={styles.analyticsStatValue}>{analytics.totalQty.toFixed(0)}</Text>
              </View>
              <View style={[styles.analyticsStatBox, { borderColor: palette.border }]}>
                <Text style={[styles.analyticsStatLabel, { color: palette.muted }]}>{t("flyers_total_receipts")}</Text>
                <Text style={styles.analyticsStatValue}>{analytics.receipts}</Text>
              </View>
              <View style={[styles.analyticsStatBox, { borderColor: palette.border }]}>
                <Text style={[styles.analyticsStatLabel, { color: palette.muted }]}>{t("card_points_title")}</Text>
                <Text style={styles.analyticsStatValue}>{points}</Text>
              </View>
            </View>

            <Text style={[styles.analyticsSectionTitle, { color: palette.text }]}>{t("flyers_category_chart_title")}</Text>
            {isLoading ? (
              <Text style={[styles.analyticsEmptyText, { color: palette.muted }]}>{t("card_loading")}</Text>
            ) : analytics.categories.length === 0 || pieTotal <= 0 ? (
              <Text style={[styles.analyticsEmptyText, { color: palette.muted }]}>{t("flyers_no_data")}</Text>
            ) : (
              <View style={styles.analyticsPieWrap}>
                <Svg width={pieSize} height={pieSize} viewBox={`0 0 ${pieSize} ${pieSize}`}>
                  <G rotation={-90} origin={`${pieSize / 2}, ${pieSize / 2}`}>
                    {analytics.categories.map((row, idx) => {
                      const sliceLength = (row.value / pieTotal) * pieCirc;
                      const gapLength = Math.max(0, pieCirc - sliceLength);
                      const dash = `${sliceLength} ${gapLength}`;
                      const offset = -dashOffsetAcc;
                      dashOffsetAcc += sliceLength;
                      return (
                        <Circle
                          key={`${row.name}-${idx}`}
                          cx={pieSize / 2}
                          cy={pieSize / 2}
                          r={pieRadius}
                          fill="none"
                          stroke={pieColors[idx % pieColors.length]}
                          strokeWidth={24}
                          strokeDasharray={dash}
                          strokeDashoffset={offset}
                          strokeLinecap="butt"
                        />
                      );
                    })}
                  </G>
                </Svg>
                <View style={styles.analyticsLegend}>
                  {analytics.categories.map((row, idx) => (
                    <View key={`${row.name}-legend`} style={styles.analyticsLegendRow}>
                      <View style={[styles.analyticsLegendColor, { backgroundColor: pieColors[idx % pieColors.length] }]} />
                      <Text style={[styles.analyticsLegendText, { color: palette.text }]}>
                        {row.name}: {row.value.toFixed(2)} ден.
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <Pressable
              style={[styles.analyticsPurchasesToggleBtn, { backgroundColor: palette.inputBg, borderColor: palette.border }]}
              onPress={() => setShowPurchases((prev) => !prev)}
            >
              <Text style={[styles.analyticsPurchasesToggleText, { color: palette.text }]}>{t("flyers_recent_purchases")}</Text>
              <Ionicons name={showPurchases ? "chevron-up" : "chevron-down"} size={16} color={palette.text} />
            </Pressable>
            {showPurchases ? (
              filteredPurchases.length === 0 ? (
                <Text style={[styles.analyticsEmptyText, { color: palette.muted }]}>{t("flyers_no_data")}</Text>
              ) : (
                sortedPurchases.slice(0, 120).map((item, idx) => (
                  <View key={`${item.brojSka}-${item.brKasa}-${idx}`} style={[styles.analyticsPurchaseRow, { borderBottomColor: palette.border }]}>
                    <Text style={[styles.analyticsPurchaseName, { color: palette.text }]}>{item.imeArt}</Text>
                    <Text style={[styles.analyticsPurchaseMeta, { color: palette.muted }]}>
                      Сметка: {item.brojSka || "-"} | {normalizePurchaseDate(item.datumSka)} | x{item.kolicina} | {toNumberSafe(item.vrednost).toFixed(2)} ден. | {categorizeProduct(item.imeArt)}
                    </Text>
                  </View>
                ))
              )
            ) : null}
          </>
        )}
      </View>
    </ScreenWrap>
  );
}

function CardScreen({
  card,
  onScanCard,
  onDeleteCard,
  onLoadPoints,
}: {
  card: CardData;
  onScanCard: (cardNumber: string) => Promise<string>;
  onDeleteCard: () => Promise<string>;
  onLoadPoints: () => Promise<number>;
}) {
  const { palette, mode } = useAppTheme();
  const { t } = useI18n();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [manualCardInput, setManualCardInput] = useState(card.cardNumber);
  const [points, setPoints] = useState<number>(0);

  useEffect(() => {
    setManualCardInput(card.cardNumber);
  }, [card.cardNumber]);

  useEffect(() => {
    let active = true;
    const loadCardData = async () => {
      if (!card.cardNumber) {
        if (!active) return;
        setPoints(0);
        return;
      }
      try {
        const nextPoints = await onLoadPoints();
        if (!active) return;
        setPoints(nextPoints);
      } catch {
        if (!active) return;
      }
    };
    void loadCardData();
    return () => {
      active = false;
    };
  }, [card.cardNumber, onLoadPoints]);

  const handleOpenScanner = async () => {
    setScanStatus("");
    setScanLocked(false);
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        setScanStatus(t("camera_permission_error"));
        return;
      }
    }
    setIsScannerOpen(true);
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    const digits = String(data || "").replace(/\D/g, "");
    if (!digits) {
      setScanStatus(t("invalid_barcode"));
      setScanLocked(false);
      return;
    }

    setIsScannerOpen(false);
    const scannedCardNumber = digits.slice(0, 16);
    const result = await onScanCard(scannedCardNumber);
    setScanStatus(result);
    setScanLocked(false);
  };

  const handleManualCardSave = async () => {
    const digits = manualCardInput.replace(/\D/g, "").slice(0, 16);
    if (!digits) {
      setScanStatus(t("state_card_invalid"));
      return;
    }
    setManualCardInput(digits);
    const result = await onScanCard(digits);
    setScanStatus(result);
  };

  const handleDeleteCard = async () => {
    const result = await onDeleteCard();
    setScanStatus(result);
    setManualCardInput("");
  };

  if (isScannerOpen) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
        <View style={styles.scannerWrap}>
          <CameraView
            style={styles.scannerCamera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "itf14"],
            }}
            onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerTitle}>{t("scan_barcode_title")}</Text>
            <Text style={styles.scannerHint}>{t("scan_barcode_hint")}</Text>
            <Pressable style={styles.scannerCloseBtn} onPress={() => setIsScannerOpen(false)}>
              <Text style={styles.scannerCloseBtnText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenWrap
      title={t("screen_card_title")}
      subtitle={t("screen_card_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <Pressable style={[styles.scanBtn, { backgroundColor: palette.card, borderColor: palette.green }]} onPress={() => void handleOpenScanner()}>
        <Ionicons name="scan-outline" size={18} color={colors.green} />
        <Text style={styles.scanBtnText}>{t("scan_barcode_camera")}</Text>
      </Pressable>
      <TextInput
        value={manualCardInput}
        onChangeText={setManualCardInput}
        placeholder={t("loyalty_placeholder")}
        keyboardType="number-pad"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
      />
      <Pressable style={[styles.primaryBtn, { marginBottom: 10 }]} onPress={() => void handleManualCardSave()}>
        <Text style={styles.primaryBtnText}>{t("save_profile")}</Text>
      </Pressable>
      {card.cardNumber ? (
        <Pressable style={styles.cardDeleteBtn} onPress={() => void handleDeleteCard()}>
          <Text style={styles.cardDeleteBtnText}>{t("card_delete_button")}</Text>
        </Pressable>
      ) : null}
      {scanStatus ? <Text style={[styles.scanStatusText, { color: palette.muted }]}>{scanStatus}</Text> : null}
      <View style={[styles.cardBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <View style={styles.cardBackWrap}>
          <Image source={cardBackImage} style={styles.cardBackImage} resizeMode="contain" />
          <View style={styles.cardBackBarcodeWrap}>
            <BarcodeStrip value={card.barcode} height={34} />
            <Text style={styles.cardBackBarcodeDigits}>{card.barcode}</Text>
          </View>
        </View>
      </View>
      <View style={[styles.cardDataBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <Text style={[styles.cardDataTitle, { color: palette.text }]}>
          {t("card_points_title")}: <Text style={styles.cardDataPointsValue}>{points}</Text>
        </Text>
      </View>
    </ScreenWrap>
  );
}

function PriceCheckScreen({
  onCheckPrice,
}: {
  onCheckPrice: (query: string) => Promise<{ product: ProductPrice | null; error: string | null }>;
}) {
  const { palette, mode } = useAppTheme();
  const { t } = useI18n();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [status, setStatus] = useState("");
  const [product, setProduct] = useState<ProductPrice | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const lookup = async (rawQuery: string) => {
    if (isChecking) return;
    const query = rawQuery.trim();
    if (query.length < 2) {
      setStatus(t("price_invalid"));
      setProduct(null);
      return;
    }
    setIsChecking(true);
    try {
      const result = await onCheckPrice(query);
      if (result.error) {
        setStatus(result.error);
        setProduct(null);
        return;
      }
      if (!result.product) {
        setStatus(t("price_not_found"));
        setProduct(null);
        return;
      }
      setStatus("");
      setProduct(result.product);
    } finally {
      setIsChecking(false);
    }
  };

  const handleOpenScanner = async () => {
    setScanLocked(false);
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setStatus(t("camera_permission_error"));
        return;
      }
    }
    setIsScannerOpen(true);
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    setScanLocked(true);
    const barcode = String(data || "").replace(/\D/g, "");
    setIsScannerOpen(false);
    setBarcodeInput(barcode);
    await lookup(barcode);
    setScanLocked(false);
  };

  if (isScannerOpen) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
        <View style={styles.scannerWrap}>
          <CameraView
            style={styles.scannerCamera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "itf14"],
            }}
            onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <Text style={styles.scannerTitle}>{t("screen_prices_title")}</Text>
            <Text style={styles.scannerHint}>{t("scan_barcode_hint")}</Text>
            <Pressable style={styles.scannerCloseBtn} onPress={() => setIsScannerOpen(false)}>
              <Text style={styles.scannerCloseBtnText}>{t("cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ScreenWrap
      title={t("screen_prices_title")}
      subtitle={t("screen_prices_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <Pressable style={[styles.scanBtn, { backgroundColor: palette.card, borderColor: palette.green }]} onPress={() => void handleOpenScanner()}>
        <Ionicons name="scan-outline" size={18} color={colors.green} />
        <Text style={styles.scanBtnText}>{t("price_scan_btn")}</Text>
      </Pressable>

      <TextInput
        value={barcodeInput}
        onChangeText={setBarcodeInput}
        placeholder={t("price_input_placeholder")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        keyboardType="default"
      />
      <Pressable
        disabled={isChecking}
        style={({ pressed }) => [
          styles.loginBtn,
          {
            marginTop: 0,
            opacity: isChecking ? 0.75 : pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
        onPress={() => void lookup(barcodeInput)}
      >
        {isChecking ? (
          <ActivityIndicator size="small" color={colors.green} />
        ) : (
          <Ionicons name="pricetag-outline" size={20} color={colors.green} />
        )}
        <Text style={[styles.loginBtnText, { color: colors.green }]}>
          {isChecking ? `${t("price_check_btn")}...` : t("price_check_btn")}
        </Text>
      </Pressable>
      {status ? <Text style={[styles.scanStatusText, { color: palette.muted }]}>{status}</Text> : null}

      {product ? (
        <View style={[styles.priceResultCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.priceResultTitle, { color: palette.text }]}>{t("price_result_title")}</Text>
          <Text style={[styles.priceResultName, { color: palette.text }]}>{product.name}</Text>
          <Text style={styles.priceResultValue}>{`${product.price} ден.`}{product.unit ? ` / ${product.unit}` : ""}</Text>
          <Text style={[styles.priceResultMeta, { color: palette.muted }]}>
            {t("price_barcode_label")}: {product.barcode}
          </Text>
          <Text style={[styles.priceResultMeta, { color: palette.muted }]}>
            {t("price_updated_label")}: {product.updatedAt}
          </Text>
        </View>
      ) : null}
    </ScreenWrap>
  );
}

function ShoppingListScreen({
  items,
  onAddItem,
  onToggleItem,
  onRemoveItem,
  onClearPurchased,
}: {
  items: ShoppingItem[];
  onAddItem: (name: string, quantity: string, note: string) => void;
  onToggleItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onClearPurchased: () => void;
}) {
  const { palette, mode } = useAppTheme();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt),
    [items],
  );

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onAddItem(trimmedName, quantity.trim(), note.trim());
    setName("");
    setQuantity("");
    setNote("");
  };

  return (
    <ScreenWrap
      title={t("screen_shopping_title")}
      subtitle={t("screen_shopping_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <View style={[styles.shoppingForm, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("shopping_item_placeholder")}
          placeholderTextColor="#9A9A9A"
          style={[styles.input, styles.shoppingInput, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        />
        <TextInput
          value={quantity}
          onChangeText={setQuantity}
          placeholder={t("shopping_qty_placeholder")}
          placeholderTextColor="#9A9A9A"
          style={[styles.input, styles.shoppingQtyInput, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("shopping_note_placeholder")}
          placeholderTextColor="#9A9A9A"
          style={[styles.input, styles.shoppingInput, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        />
        <Pressable style={[styles.loginBtn, { marginTop: 0 }]} onPress={submit}>
          <Ionicons name="add-outline" size={20} color={colors.green} />
          <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("shopping_add_btn")}</Text>
        </Pressable>
        <Pressable style={[styles.loginBtn, styles.shoppingClearBtn, { marginTop: 8 }]} onPress={onClearPurchased}>
          <Ionicons name="trash-outline" size={18} color={colors.green} />
          <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("shopping_clear_checked")}</Text>
        </Pressable>
      </View>

      {sortedItems.length === 0 ? (
        <View style={[styles.shoppingEmptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.shoppingEmptyText, { color: palette.muted }]}>{t("shopping_empty")}</Text>
        </View>
      ) : (
        sortedItems.map((item) => (
          <View
            key={item.id}
            style={[
              styles.shoppingItemCard,
              {
                backgroundColor: palette.card,
                borderColor: palette.border,
                opacity: item.done ? 0.72 : 1,
              },
            ]}
          >
            <Pressable style={styles.shoppingToggleWrap} onPress={() => onToggleItem(item.id)}>
              <Ionicons
                name={item.done ? "checkbox-outline" : "square-outline"}
                size={22}
                color={item.done ? colors.green : palette.muted}
              />
            </Pressable>
            <View style={styles.shoppingTextWrap}>
              <Text
                style={[
                  styles.shoppingItemName,
                  { color: palette.text, textDecorationLine: item.done ? "line-through" : "none" },
                ]}
              >
                {item.name}
              </Text>
              {!!item.quantity && <Text style={[styles.shoppingMeta, { color: palette.muted }]}>{item.quantity}</Text>}
              {!!item.note && <Text style={[styles.shoppingMeta, { color: palette.muted }]}>{item.note}</Text>}
            </View>
            <Pressable style={styles.shoppingDeleteBtn} onPress={() => onRemoveItem(item.id)}>
              <Ionicons name="close-outline" size={22} color={palette.muted} />
            </Pressable>
          </View>
        ))
      )}
    </ScreenWrap>
  );
}

function NotificationsScreen({ notices }: { notices: Notice[] }) {
  const { palette } = useAppTheme();
  const { t } = useI18n();
  const [activePdfUrl, setActivePdfUrl] = useState("");
  const [pdfLoadProgress, setPdfLoadProgress] = useState(0);
  const [pdfLoadError, setPdfLoadError] = useState("");

  const openNoticePdf = (url: string) => {
    setPdfLoadProgress(0);
    setPdfLoadError("");
    setActivePdfUrl(url);
  };

  return (
    <ScreenWrap
      title={t("screen_notifications_title")}
      subtitle={t("screen_notifications_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      {notices.map((notice) => (
        <View key={notice.id} style={[styles.notificationCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.notificationTitle, { color: palette.text }]}>{notice.title}</Text>
          {!!notice.body && <Text style={[styles.notificationBody, { color: palette.muted }]}>{notice.body}</Text>}
          {notice.kind === "image" && normalizeExternalFlyerUrl(notice.mediaUrl) ? (
            <Image source={{ uri: normalizeExternalFlyerUrl(notice.mediaUrl) }} style={styles.notificationMediaImage} resizeMode="cover" />
          ) : null}
          {notice.kind === "pdf" && normalizeExternalFlyerUrl(notice.mediaUrl) ? (
            <Pressable onPress={() => openNoticePdf(normalizeExternalFlyerUrl(notice.mediaUrl))} style={styles.notificationPdfCard}>
              {normalizeExternalFlyerUrl(notice.thumbnailUrl) ? (
                <Image source={{ uri: normalizeExternalFlyerUrl(notice.thumbnailUrl) }} style={styles.notificationMediaImage} resizeMode="cover" />
              ) : (
                <View style={styles.notificationPdfFallback}>
                  <MaterialIcons name="picture-as-pdf" size={30} color="#B31F1F" />
                  <Text style={styles.notificationPdfFallbackText}>PDF</Text>
                </View>
              )}
              <View style={styles.currentFlyerPdfBadge}>
                <MaterialIcons name="picture-as-pdf" size={14} color="#FFFFFF" />
                <Text style={styles.currentFlyerPdfBadgeText}>PDF</Text>
              </View>
            </Pressable>
          ) : null}
          <Text style={[styles.notificationTime, { color: palette.green }]}>{notice.createdAt}</Text>
        </View>
      ))}
      <Modal visible={Boolean(activePdfUrl)} animationType="slide" transparent={false} onRequestClose={() => setActivePdfUrl("")}>
        <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
          <View style={[styles.pdfModalHeader, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[styles.pdfModalTitle, { color: palette.text }]}>Нотификација PDF</Text>
            <Pressable
              style={styles.pdfModalCloseBtn}
              onPress={() => {
                setActivePdfUrl("");
                setPdfLoadProgress(0);
                setPdfLoadError("");
              }}
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={[styles.pdfProgressWrap, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.pdfProgressTrack}>
              <View style={[styles.pdfProgressFill, { width: `${Math.max(0, Math.min(100, pdfLoadProgress))}%` }]} />
            </View>
            <Text style={[styles.pdfProgressText, { color: palette.muted }]}>
              {pdfLoadError ? `Грешка: ${pdfLoadError}` : `Вчитување PDF: ${Math.round(pdfLoadProgress)}%`}
            </Text>
          </View>
          {activePdfUrl ? (
            <Pdf
              source={{ uri: activePdfUrl, cache: true }}
              style={styles.pdfModalWebView}
              onLoadProgress={(percent: number) => {
                const next = Number.isFinite(percent) ? percent * 100 : 0;
                setPdfLoadProgress(Math.max(0, Math.min(100, next)));
              }}
              onLoadComplete={() => {
                setPdfLoadProgress(100);
                setPdfLoadError("");
              }}
              onError={(error) => {
                const message =
                  error && typeof error === "object" && "message" in error
                    ? String((error as { message?: unknown }).message || "PDF не може да се отвори")
                    : "PDF не може да се отвори";
                setPdfLoadError(message);
              }}
              trustAllCerts={false}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </ScreenWrap>
  );
}

function LocationsScreen() {
  const { palette, mode } = useAppTheme();
  const { t } = useI18n();

  const sections = useMemo(() => {
    const byCity = new Map<string, MarketLocation[]>();
    for (const item of marketLocations) {
      const city = resolveMarketCity(item);
      if (!byCity.has(city)) byCity.set(city, []);
      byCity.get(city)?.push({ ...item, city });
    }
    return Array.from(byCity.entries())
      .map(([city, items]) => ({
        city,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name, "mk")),
      }))
      .sort((a, b) => a.city.localeCompare(b.city, "mk"));
  }, []);
  const [selectedCity, setSelectedCity] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [nearestStatus, setNearestStatus] = useState("");
  const [nearestKey, setNearestKey] = useState("");
  const cityButtons = useMemo(() => ["all", ...sections.map((section) => section.city)], [sections]);
  const visibleSections = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    return sections
      .filter((section) => selectedCity === "all" || section.city === selectedCity)
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (!normalized) return true;
          const haystack = `${item.name} ${item.address} ${item.city}`.toLowerCase();
          return haystack.includes(normalized);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, selectedCity, searchQuery]);

  const openMaps = async (item: MarketLocation) => {
    const hasCoords = typeof item.lat === "number" && typeof item.lng === "number";
    const query = hasCoords ? `${item.lat},${item.lng}` : `${item.name} ${item.address} ${item.city} North Macedonia`;
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    if (Platform.OS === "android" && hasCoords) {
      const geoUrl = `geo:${item.lat},${item.lng}?q=${item.lat},${item.lng}`;
      try {
        const supported = await Linking.canOpenURL(geoUrl);
        if (supported) {
          await Linking.openURL(geoUrl);
          return;
        }
      } catch {
        // Fallback to web maps URL.
      }
    }
    await Linking.openURL(mapsUrl);
  };

  const findNearestMarket = async () => {
    const candidates = marketLocations.filter(
      (item) =>
        typeof item.lat === "number" &&
        typeof item.lng === "number" &&
        (selectedCity === "all" || resolveMarketCity(item) === selectedCity),
    );
    if (!candidates.length) {
      setNearestStatus(t("locations_gps_no_markets"));
      return;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      setNearestStatus(t("locations_gps_permission"));
      return;
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      setNearestStatus(t("locations_gps_permission"));
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;
      let nearest: MarketLocation | null = null;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const item of candidates) {
        if (item.lat == null || item.lng == null) continue;
        const dist = haversineDistanceKm(latitude, longitude, item.lat, item.lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearest = item;
        }
      }

      if (!nearest) {
        setNearestStatus(t("locations_gps_no_markets"));
        return;
      }

      const nearestCity = resolveMarketCity(nearest);
      setSelectedCity(nearestCity);
      setSearchQuery("");
      setNearestKey(`${nearestCity}-${nearest.name}-${nearest.address}`);
      setNearestStatus(`${t("locations_nearest_found")}: ${nearest.name} (${minDistance.toFixed(1)} km)`);
      await openMaps(nearest);
    } catch {
      setNearestStatus(t("locations_gps_unavailable"));
    }
  };

  return (
    <ScreenWrap
      title={t("screen_locations_title")}
      subtitle={t("screen_locations_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={t("locations_search_placeholder")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, styles.locationSearchInput, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
      />
      <Pressable style={[styles.loginBtn, { marginTop: 0 }]} onPress={() => void findNearestMarket()}>
        <Ionicons name="locate-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("locations_find_nearest")}</Text>
      </Pressable>
      {nearestStatus ? <Text style={[styles.scanStatusText, { color: palette.muted }]}>{nearestStatus}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locationCityChipsRow}>
        {cityButtons.map((city) => {
          const active = selectedCity === city;
          return (
            <Pressable
              key={`city-chip-${city}`}
              onPress={() => setSelectedCity(city)}
              style={[
                styles.locationCityChip,
                {
                  backgroundColor: active ? colors.green : palette.card,
                  borderColor: "#ADF5A6",
                },
              ]}
            >
              <Text
                style={[
                  styles.locationCityChipText,
                  { color: active ? "#FFFFFF" : palette.text },
                ]}
              >
                {city === "all" ? t("locations_all") : city}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {visibleSections.length === 0 ? (
        <View style={[styles.shoppingEmptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Text style={[styles.shoppingEmptyText, { color: palette.muted }]}>{t("locations_no_results")}</Text>
        </View>
      ) : null}
      {visibleSections.map((section) => (
        <View key={section.city} style={styles.locationSection}>
          <Text style={[styles.locationCityTitle, { color: palette.text }]}>{section.city}</Text>
          {section.items.map((item) => {
            const hasCoords = typeof item.lat === "number" && typeof item.lng === "number";
            return (
              <View
                key={`${section.city}-${item.name}-${item.address}`}
                style={[
                  styles.locationCard,
                  {
                    backgroundColor: palette.card,
                    borderColor:
                      nearestKey === `${section.city}-${item.name}-${item.address}` ? colors.green : palette.border,
                    borderWidth:
                      nearestKey === `${section.city}-${item.name}-${item.address}` ? 2 : 1,
                  },
                ]}
              >
                <Text style={[styles.locationName, { color: palette.text }]}>{item.name}</Text>
                <Text style={[styles.locationAddress, { color: palette.muted }]}>
                  {item.address || "-"}
                </Text>
                <Text style={[styles.locationCoords, { color: palette.muted }]}>
                  {hasCoords
                    ? `${t("coordinates_label")}: ${item.lat?.toFixed(6)}, ${item.lng?.toFixed(6)}`
                    : t("no_coordinates")}
                </Text>
                <Pressable style={styles.locationMapBtn} onPress={() => void openMaps(item)}>
                  <Ionicons name="location-outline" size={18} color={colors.green} />
                  <Text style={styles.locationMapBtnText}>{t("open_in_maps")}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </ScreenWrap>
  );
}

function ProfileScreen({
  user,
  pushToken,
  pushState,
  profileState,
  language,
  onSetLanguage,
  onUpdateProfile,
  onChangePassword,
  onRefresh,
  onOpenShoppingList,
  onLogout,
}: {
  user: User;
  pushToken: string;
  pushState: string;
  profileState: string;
  language: LanguageCode;
  onSetLanguage: (language: LanguageCode) => void;
  onUpdateProfile: (name: string, email: string) => void;
  onChangePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => void;
  onRefresh: () => void;
  onOpenShoppingList: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const { palette, mode } = useAppTheme();
  const [editName, setEditName] = useState(user.name);
  const [editEmail, setEditEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setEditName(user.name);
    setEditEmail(user.email);
  }, [user.name, user.email]);

  return (
    <ScreenWrap
      title={t("screen_profile_title")}
      subtitle={t("screen_profile_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <InfoCard title={t("name_label")} value={user.name} />
      <InfoCard title={t("email_label")} value={user.email} />
      <InfoCard title={t("push_status_label")} value={pushState} />
      <InfoCard title={t("push_token_label")} value={pushToken || t("no_token")} />
      <InfoCard title={t("profile_status_label")} value={profileState || "-"} />

      <Text style={[styles.infoTitle, { marginTop: 10, color: palette.text }]}>{t("profile_basic_section")}</Text>
      <TextInput
        value={editName}
        onChangeText={setEditName}
        placeholder={t("name_placeholder")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
      />
      <TextInput
        value={editEmail}
        onChangeText={setEditEmail}
        placeholder={t("email_placeholder")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <Pressable style={[styles.loginBtn, { marginTop: 0 }]} onPress={() => onUpdateProfile(editName.trim(), editEmail.trim())}>
        <Ionicons name="save-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("save_profile")}</Text>
      </Pressable>

      <Text style={[styles.infoTitle, { marginTop: 10, color: palette.text }]}>{t("profile_password_section")}</Text>
      <TextInput
        value={currentPassword}
        onChangeText={setCurrentPassword}
        placeholder={t("current_password_label")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <TextInput
        value={newPassword}
        onChangeText={setNewPassword}
        placeholder={t("new_password_label")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder={t("confirm_password_label")}
        placeholderTextColor="#9A9A9A"
        style={[styles.input, { backgroundColor: palette.inputBg, borderColor: palette.border, color: palette.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Pressable
        style={[styles.loginBtn, { marginTop: 0 }]}
        onPress={() => {
          onChangePassword(currentPassword, newPassword, confirmPassword);
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }}
      >
        <Ionicons name="lock-closed-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("change_password")}</Text>
      </Pressable>

      <Text style={[styles.infoTitle, { marginTop: 10 }]}>{t("language")}</Text>
      <View style={styles.langRow}>
        <Pressable style={[styles.langChip, language === "mk" && styles.langChipActive]} onPress={() => onSetLanguage("mk")}>
          <Text style={[styles.langChipText, language === "mk" && styles.langChipTextActive]}>{t("lang_mk")}</Text>
        </Pressable>
        <Pressable style={[styles.langChip, language === "en" && styles.langChipActive]} onPress={() => onSetLanguage("en")}>
          <Text style={[styles.langChipText, language === "en" && styles.langChipTextActive]}>{t("lang_en")}</Text>
        </Pressable>
        <Pressable style={[styles.langChip, language === "sq" && styles.langChipActive]} onPress={() => onSetLanguage("sq")}>
          <Text style={[styles.langChipText, language === "sq" && styles.langChipTextActive]}>{t("lang_sq")}</Text>
        </Pressable>
        <Pressable style={[styles.langChip, language === "tr" && styles.langChipActive]} onPress={() => onSetLanguage("tr")}>
          <Text style={[styles.langChipText, language === "tr" && styles.langChipTextActive]}>{t("lang_tr")}</Text>
        </Pressable>
      </View>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onOpenShoppingList}>
        <Ionicons name="basket-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("open_shopping_list")}</Text>
      </Pressable>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onRefresh}>
        <MaterialIcons name="refresh" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("refresh_data")}</Text>
      </Pressable>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("logout")}</Text>
      </Pressable>
    </ScreenWrap>
  );
}

function MoreScreen({
  onOpenCard,
  onOpenLocations,
  onOpenProfile,
}: {
  onOpenCard: () => void;
  onOpenLocations: () => void;
  onOpenProfile: () => void;
}) {
  const { t } = useI18n();
  const { palette, mode } = useAppTheme();

  return (
    <ScreenWrap
      title=""
      subtitle={t("screen_more_subtitle")}
      titleStyle={[styles.flyersScreenTitle, { color: getHeadlineColorByPalette(palette), textShadowColor: getHeadlineOutlineColorByPalette(palette), textShadowOffset: { width: 0, height: 0 }, textShadowRadius: HEADLINE_OUTLINE_RADIUS }]}
      subtitleStyle={styles.flyersScreenSubtitle}
    >
      <Pressable style={[styles.loginBtn, { marginTop: 0 }]} onPress={onOpenCard}>
        <Ionicons name="card-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("tab_card")}</Text>
      </Pressable>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onOpenLocations}>
        <Ionicons name="location-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("tab_locations")}</Text>
      </Pressable>
      <Pressable style={[styles.loginBtn, { marginTop: 8 }]} onPress={onOpenProfile}>
        <Ionicons name="person-outline" size={20} color={colors.green} />
        <Text style={[styles.loginBtnText, { color: colors.green }]}>{t("tab_profile")}</Text>
      </Pressable>
    </ScreenWrap>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  const { palette } = useAppTheme();
  return (
    <View style={[styles.infoCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Text style={[styles.infoTitle, { color: palette.muted }]}>{title}</Text>
      <Text style={[styles.infoValue, { color: palette.text }]}>{value}</Text>
    </View>
  );
}

function ScreenWrap({
  title,
  subtitle,
  children,
  titleStyle,
  subtitleStyle,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.topBrandBar, { height: insets.top + 74 }]}>
        <Image source={topBrandLogoImage} style={styles.topBrandLogo} resizeMode="contain" />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: tabBarHeight + 20 },
        ]}
      >
        {title.trim().length > 0 ? <Text style={[styles.screenTitle, { color: palette.text }, titleStyle]}>{title}</Text> : null}
        <Text style={[styles.screenSubtitle, { color: palette.muted }, subtitleStyle]}>{subtitle}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function MainTabs({
  user,
  flyers,
  currentFlyers,
  bestDeals,
  homeTopItem,
  notices,
  card,
  shoppingItems,
  pushToken,
  pushState,
  profileState,
  language,
  onAddShoppingItem,
  onToggleShoppingItem,
  onRemoveShoppingItem,
  onClearPurchasedShoppingItems,
  onSetLanguage,
  onScanCard,
  onDeleteCard,
  onLoadLoyaltyPurchases,
  onLoadLoyaltyPoints,
  onCheckPrice,
  onUpdateProfile,
  onChangePassword,
  onRegisterPush,
  onSendTestPush,
  onRefresh,
  onLogout,
}: {
  user: User;
  flyers: Flyer[];
  currentFlyers: CurrentFlyerMock[];
  bestDeals: BestDealItem[];
  homeTopItem: HomeTopItem | null;
  notices: Notice[];
  card: CardData;
  shoppingItems: ShoppingItem[];
  pushToken: string;
  pushState: string;
  profileState: string;
  language: LanguageCode;
  onAddShoppingItem: (name: string, quantity: string, note: string) => void;
  onToggleShoppingItem: (id: string) => void;
  onRemoveShoppingItem: (id: string) => void;
  onClearPurchasedShoppingItems: () => void;
  onSetLanguage: (language: LanguageCode) => void;
  onScanCard: (cardNumber: string) => Promise<string>;
  onDeleteCard: () => Promise<string>;
  onLoadLoyaltyPurchases: () => Promise<PurchaseItem[]>;
  onLoadLoyaltyPoints: () => Promise<number>;
  onCheckPrice: (query: string) => Promise<{ product: ProductPrice | null; error: string | null }>;
  onUpdateProfile: (name: string, email: string) => void;
  onChangePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => void;
  onRegisterPush: () => void;
  onSendTestPush: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [hasUnreadNotices, setHasUnreadNotices] = useState(false);
  const [blinkOn, setBlinkOn] = useState(true);
  const seenNoticeCountRef = useRef(notices.length);
  const tabBottomPadding = Math.max(insets.bottom, Platform.OS === "android" ? 10 : 8);
  const tabHeight = 58 + tabBottomPadding;

  useEffect(() => {
    if (notices.length > seenNoticeCountRef.current) {
      setHasUnreadNotices(true);
    }
  }, [notices]);

  useEffect(() => {
    if (!hasUnreadNotices) {
      setBlinkOn(true);
      return;
    }
    const timer = setInterval(() => {
      setBlinkOn((prev) => !prev);
    }, 650);
    return () => clearInterval(timer);
  }, [hasUnreadNotices]);

  const markNotificationsRead = () => {
    seenNoticeCountRef.current = notices.length;
    setHasUnreadNotices(false);
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.green,
        tabBarInactiveTintColor: palette.muted,
        tabBarShowLabel: false,
        tabBarStyle: {
          borderTopColor: palette.border,
          backgroundColor: palette.card,
          height: tabHeight,
          paddingBottom: tabBottomPadding,
          paddingTop: 6,
          paddingHorizontal: 0,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          lineHeight: 12,
          marginTop: -2,
          marginBottom: 2,
          includeFontPadding: false,
          textAlign: "center",
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarIcon: ({ color }) => {
          const map: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
            Home: "home",
            Flyers: "pricetags",
            Card: "card",
            PriceCheck: "barcode-outline",
            Shopping: "basket",
            Locations: "location",
            Notifications: "notifications",
            Profile: "person",
            More: "ellipsis-horizontal-circle",
          };
          if (route.name === "Flyers") {
            return <Text style={{ color, fontSize: 21, fontWeight: "900", lineHeight: 22 }}>%</Text>;
          }
          if (route.name === "Notifications" && hasUnreadNotices) {
            return (
              <View style={{ opacity: blinkOn ? 1 : 0.22 }}>
                <Ionicons name={map[route.name as keyof TabParamList]} size={21} color={blinkOn ? palette.green : color} />
              </View>
            );
          }
          return <Ionicons name={map[route.name as keyof TabParamList]} size={21} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" options={{ title: t("tab_home") }}>
        {({ navigation }) => (
          <HomeScreen
            currentFlyers={currentFlyers}
            bestDeals={bestDeals}
            homeTopItem={homeTopItem}
            shoppingItems={shoppingItems}
            onAddShoppingItem={onAddShoppingItem}
            onOpenShoppingList={() => navigation.navigate("Shopping")}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="Flyers" options={{ title: t("tab_flyers") }}>
        {({ navigation }) => (
          <FlyersScreen
            card={card}
            onLoadPurchases={onLoadLoyaltyPurchases}
            onLoadPoints={onLoadLoyaltyPoints}
            onOpenShoppingList={() => navigation.navigate("Shopping")}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="PriceCheck" options={{ title: t("tab_prices") }}>
        {() => <PriceCheckScreen onCheckPrice={onCheckPrice} />}
      </Tab.Screen>
      <Tab.Screen name="Notifications" options={{ title: t("tab_notifications") }} listeners={{ focus: markNotificationsRead }}>
        {() => <NotificationsScreen notices={notices} />}
      </Tab.Screen>
      <Tab.Screen name="Shopping" options={{ title: t("tab_shopping") }}>
        {() => (
          <ShoppingListScreen
            items={shoppingItems}
            onAddItem={onAddShoppingItem}
            onToggleItem={onToggleShoppingItem}
            onRemoveItem={onRemoveShoppingItem}
            onClearPurchased={onClearPurchasedShoppingItems}
          />
        )}
      </Tab.Screen>
      <Tab.Screen name="More" options={{ title: t("tab_more") }}>
        {({ navigation }) => (
          <MoreScreen
            onOpenCard={() => navigation.navigate("Card")}
            onOpenLocations={() => navigation.navigate("Locations")}
            onOpenProfile={() => navigation.navigate("Profile")}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Card"
        options={{
          title: t("tab_card"),
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" },
        }}
      >
        {() => (
          <CardScreen
            card={card}
            onScanCard={onScanCard}
            onDeleteCard={onDeleteCard}
            onLoadPoints={onLoadLoyaltyPoints}
          />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Locations"
        options={{
          title: t("tab_locations"),
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" },
        }}
      >
        {() => <LocationsScreen />}
      </Tab.Screen>
      <Tab.Screen
        name="Profile"
        options={{
          title: t("tab_profile"),
          tabBarButton: () => null,
          tabBarItemStyle: { display: "none" },
        }}
      >
        {({ navigation }) => (
          <ProfileScreen
            user={user}
            pushToken={pushToken}
            pushState={pushState}
            profileState={profileState}
            language={language}
            onSetLanguage={onSetLanguage}
            onUpdateProfile={onUpdateProfile}
            onChangePassword={onChangePassword}
            onRefresh={onRefresh}
            onOpenShoppingList={() => navigation.navigate("Shopping")}
            onLogout={onLogout}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

async function registerForPush(t: (key: string) => string): Promise<string> {
  if (!Device.isDevice) return t("push_physical_device");
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return t("push_no_permission");

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;
  let token;
  try {
    token = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      Platform.OS === "android" &&
      (message.includes("Default FirebaseApp") || message.includes("no default options"))
    ) {
      throw new Error("missing_firebase_config");
    }
    if (!projectId) {
      throw new Error("missing_eas_project_id");
    }
    throw error;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  return token.data;
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [language, setLanguageState] = useState<LanguageCode>("mk");
  const [loggedIn, setLoggedIn] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true);
  const apiBase = DEFAULT_API_BASE;
  const palette = themeMode === "dark" ? DARK_THEME : LIGHT_THEME;
  const t = (key: string) => I18N[language][key] ?? I18N.mk[key] ?? key;

  const [user, setUser] = useState<User>(fallbackUser);
  const [flyers, setFlyers] = useState<Flyer[]>(fallbackFlyers);
  const [currentFlyers, setCurrentFlyers] = useState<CurrentFlyerMock[]>([]);
  const [bestDeals, setBestDeals] = useState<BestDealItem[]>([]);
  const [homeTopItem, setHomeTopItem] = useState<HomeTopItem | null>(null);
  const [notices, setNotices] = useState<Notice[]>(fallbackNotices);
  const [card, setCard] = useState<CardData>(fallbackCard);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [pushToken, setPushToken] = useState("");
  const [pushState, setPushState] = useState(t("state_unregistered"));
  const [profileState, setProfileState] = useState("-");
  const autoPushAttemptedRef = useRef(false);

  useEffect(() => {
    const loadShoppingItems = async () => {
      try {
        const raw = await AsyncStorage.getItem(SHOPPING_LIST_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as ShoppingItem[];
        if (Array.isArray(parsed)) setShoppingItems(parsed);
      } catch {
        // Ignore invalid cached shopping list.
      }
    };
    void loadShoppingItems();
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(shoppingItems));
  }, [shoppingItems]);

  const saveSessionToken = async (token: string) => {
    if (!token) return;
    try {
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch {
      // Ignore storage errors.
    }
  };

  const clearSessionToken = async () => {
    try {
      await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      // Ignore storage errors.
    }
  };

  const toggleTheme = () => {
    setThemeMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      void AsyncStorage.setItem(THEME_MODE_KEY, next);
      return next;
    });
  };

  const setLanguage = (nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    void AsyncStorage.setItem(LANGUAGE_CODE_KEY, nextLanguage);
  };

  const consumeOAuthCallback = async (url: string) => {
    if (!url.startsWith(OAUTH_REDIRECT_URI)) return;
    const queryString = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const params = new URLSearchParams(queryString);
    const token = params.get("token");
    const oauthError = params.get("error");

    if (oauthError) {
      setAuthError(t("auth_oauth_failed"));
      return;
    }
    if (!token) return;

    try {
      setAuthError("");
      setAuthToken(token);
      await saveSessionToken(token);
      setLoggedIn(true);
      await loadData(token);
    } catch {
      setAuthError(t("auth_oauth_data_missing"));
    }
  };

  const loadData = async (token: string) => {
    const [nextUser, nextFlyers, nextNotices, nextCard, nextApkGallery, nextHomeTop] = await Promise.all([
      apiGet<User>(apiBase, "/me", token),
      apiGet<Flyer[]>(apiBase, "/flyers", token),
      apiGet<Notice[]>(apiBase, "/notifications", token),
      apiGet<CardData>(apiBase, "/loyalty/card", token),
      apiGet<ApkGalleryPayload>(apiBase, "/cms/apk-gallery", token),
      apiGet<HomeTopPayload>(apiBase, "/cms/home-top", token).catch(() => ({ item: null })),
    ]);
    const nextCurrentFlyers = Array.isArray(nextApkGallery?.currentFlyers)
      ? nextApkGallery.currentFlyers.map((item) => ({
          id: String(item.id || ""),
          title: String(item.label || item.file || "Flyer"),
          price: "",
          imageUrl: String(item.imageUrl || ""),
          thumbnailUrl: String(item.thumbnailUrl || ""),
          isPdf: Boolean(item.isPdf),
        }))
      : [];
    const nextBestDeals = Array.isArray(nextApkGallery?.bestDeals)
      ? nextApkGallery.bestDeals.map((item) => ({
          id: String(item.id || ""),
          title: String(item.label || item.file || "Deal"),
          price: "",
          imageUrl: String(item.imageUrl || item.thumbnailUrl || ""),
          linkUrl: String(item.imageUrl || item.thumbnailUrl || item.file || ""),
        }))
      : [];
    setUser(nextUser);
    setFlyers(nextFlyers);
    setCurrentFlyers(nextCurrentFlyers);
    setBestDeals(nextBestDeals);
    setHomeTopItem(nextHomeTop?.item ? nextHomeTop.item : null);
    setNotices(nextNotices);
    setCard(nextCard);
  };

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored === "dark" || stored === "light") {
          setThemeMode(stored);
        }
      })
      .catch(() => {
        // Ignore theme restore errors.
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(LANGUAGE_CODE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored === "mk" || stored === "en" || stored === "sq" || stored === "tr") {
          setLanguageState(stored);
          return;
        }
        const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
        if (locale.startsWith("en")) setLanguageState("en");
        if (locale.startsWith("sq")) setLanguageState("sq");
        if (locale.startsWith("tr")) setLanguageState("tr");
      })
      .catch(() => {
        // Ignore language restore errors.
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        const savedToken = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
        if (savedToken) {
          setAuthToken(savedToken);
          await loadData(savedToken);
          if (mounted) setLoggedIn(true);
        }
      } catch {
        await clearSessionToken();
      } finally {
        if (mounted) setIsAuthBootstrapping(false);
      }
    };

    void restoreSession();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loggedIn || !authToken) return;
    void loadData(authToken).catch(() => {
      setPushState(t("state_backend_unavailable"));
    });
  }, [loggedIn, authToken, language]);

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
      await saveSessionToken(res.token);
      setUser(res.user);
      setProfileState("-");
      setLoggedIn(true);
      await loadData(res.token);
    } catch {
      setAuthError(t("auth_invalid_login"));
    }
  };

  const handleRegister = async (name: string, email: string, password: string, loyaltyCardNumber: string) => {
    try {
      setAuthError("");
      const res = await apiPost<{ token: string; user: User }>(
        apiBase,
        "/auth/register",
        { name, email, password, loyaltyCardNumber },
      );
      setAuthToken(res.token);
      await saveSessionToken(res.token);
      setUser(res.user);
      setProfileState("-");
      setLoggedIn(true);
      await loadData(res.token);
    } catch (error) {
      const apiError = extractApiErrorMessage(error).toLowerCase();
      if (apiError.includes("already linked")) {
        setAuthError(t("auth_card_linked"));
        return;
      }
      if (apiError.includes("invalid loyalty card")) {
        setAuthError(t("auth_card_invalid"));
        return;
      }
      setAuthError(t("auth_register_failed"));
    }
  };

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    try {
      setAuthError("");
      if (!apiBase.startsWith("http://") && !apiBase.startsWith("https://")) {
        setAuthError(t("auth_invalid_backend_url"));
        return;
      }
      const oauthStartUrl =
        `${apiBase}/auth/oauth/${provider}/start?redirect_uri=${encodeURIComponent(OAUTH_REDIRECT_URI)}`;
      await Linking.openURL(oauthStartUrl);
    } catch {
      setAuthError(t("auth_oauth_start_failed"));
    }
  };

  const handlePushRegister = async () => {
    try {
      const token = await registerForPush(t);
      if (token.startsWith("ExponentPushToken[")) {
        setPushToken(token);
        setPushState(t("state_push_token_generated"));
        if (authToken) {
          await apiPost(apiBase, "/push/register", { token }, authToken);
        }
      } else {
        setPushState(token);
      }
    } catch (error) {
      const apiError = extractApiErrorMessage(error);
      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage.includes("missing_eas_project_id")) {
        setPushState(t("push_missing_project_id"));
        return;
      }
      if (errorMessage.includes("missing_firebase_config")) {
        setPushState(t("push_missing_firebase"));
        return;
      }
      if (apiError) {
        setPushState(`${t("state_push_error")} (${apiError})`);
        return;
      }
      setPushState(t("state_push_error"));
    }
  };

  const handleSendTestPush = async () => {
    if (!authToken) return;
    if (!pushToken || !pushToken.startsWith("ExponentPushToken[")) {
      setPushState(t("state_push_register_first"));
      return;
    }
    try {
      await apiPost(
        apiBase,
        "/push/test",
        { token: pushToken, title: "Zito aplikacija", body: "Test push notifikacija." },
        authToken,
      );
      await loadData(authToken);
      setPushState(t("state_push_test_sent"));
    } catch (error) {
      const apiError = extractApiErrorMessage(error);
      const errorMessage = error instanceof Error ? error.message : "";
      if (errorMessage.includes("missing_eas_project_id")) {
        setPushState(t("push_missing_project_id"));
        return;
      }
      if (errorMessage.includes("missing_firebase_config")) {
        setPushState(t("push_missing_firebase"));
        return;
      }
      if (apiError) {
        setPushState(`${t("state_push_error")} (${apiError})`);
        return;
      }
      setPushState(t("state_push_error"));
    }
  };

  const handleRefresh = async () => {
    if (!authToken) return;
    try {
      await loadData(authToken);
      setPushState(t("state_refreshed"));
    } catch {
      setPushState(t("state_refresh_error"));
    }
  };

  const handleCheckPrice = async (query: string): Promise<{ product: ProductPrice | null; error: string | null }> => {
    if (!authToken) return { product: null, error: t("price_lookup_error") };
    try {
      const product = await apiPost<ProductPrice>(apiBase, "/price/check", { query }, authToken);
      return { product, error: null };
    } catch (error) {
      const apiError = extractApiErrorMessage(error).toLowerCase();
      if (apiError.includes("not found")) return { product: null, error: t("price_not_found") };
      if (apiError.includes("invalid")) return { product: null, error: t("price_invalid") };
      return { product: null, error: t("price_lookup_error") };
    }
  };

  const handleScanCard = async (cardNumber: string): Promise<string> => {
    if (!authToken) return t("state_card_error");
    try {
      const updated = await apiPost<CardData>(apiBase, "/me/card", { cardNumber }, authToken);
      setCard(updated);
      setUser((prev) => ({ ...prev, cardNumber: updated.cardNumber }));
      return t("state_card_saved");
    } catch (error) {
      const apiError = extractApiErrorMessage(error).toLowerCase();
      if (apiError.includes("already linked")) return t("state_card_linked");
      if (apiError.includes("invalid loyalty card")) return t("state_card_invalid");
      if (apiError.includes("service unavailable")) return t("state_card_service_unavailable");
      return t("state_card_error");
    }
  };

  const handleDeleteCard = async (): Promise<string> => {
    if (!authToken) return t("state_card_error");
    try {
      const updated = await apiDelete<CardData>(apiBase, "/me/card", authToken);
      setCard(updated);
      setUser((prev) => ({ ...prev, cardNumber: "" }));
      return t("state_card_deleted");
    } catch {
      return t("state_card_error");
    }
  };

  const handleLoadLoyaltyPurchases = async (): Promise<PurchaseItem[]> => {
    if (!authToken) return [];
    try {
      const result = await apiGet<{ items?: PurchaseItem[] }>(apiBase, "/loyalty/purchases", authToken);
      return Array.isArray(result?.items) ? result.items : [];
    } catch {
      return [];
    }
  };

  const handleLoadLoyaltyPoints = async (): Promise<number> => {
    if (!authToken) return 0;
    try {
      const result = await apiGet<{ points?: number }>(apiBase, "/loyalty/points", authToken);
      const value = Number(result?.points ?? 0);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  };

  const handleUpdateProfile = async (name: string, email: string) => {
    if (!authToken) return;
    try {
      const updated = await apiPost<User>(apiBase, "/me/profile", { name, email }, authToken);
      setUser(updated);
      setProfileState(t("state_profile_saved"));
    } catch (error) {
      const apiError = extractApiErrorMessage(error).toLowerCase();
      if (apiError.includes("email already")) {
        setProfileState(t("state_profile_email_exists"));
        return;
      }
      setProfileState(t("state_profile_error"));
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string, confirmPassword: string) => {
    if (!authToken) return;
    if (newPassword !== confirmPassword) {
      setProfileState(t("state_password_mismatch"));
      return;
    }
    if (newPassword.length < 6) {
      setProfileState(t("state_password_too_short"));
      return;
    }
    try {
      await apiPost(apiBase, "/me/password", { currentPassword, newPassword }, authToken);
      setProfileState(t("state_password_changed"));
    } catch (error) {
      const apiError = extractApiErrorMessage(error).toLowerCase();
      if (apiError.includes("invalid current password")) {
        setProfileState(t("state_current_password_invalid"));
        return;
      }
      setProfileState(t("state_password_error"));
    }
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setAuthToken("");
    void clearSessionToken();
    setAuthError("");
    setPushToken("");
    setPushState(t("state_unregistered"));
    setProfileState("-");
    autoPushAttemptedRef.current = false;
    setUser(fallbackUser);
    setFlyers(fallbackFlyers);
    setCurrentFlyers([]);
    setBestDeals([]);
    setHomeTopItem(null);
    setNotices(fallbackNotices);
    setCard({ cardNumber: "", barcode: "", qrValue: "" });
  };

  const handleAddShoppingItem = (name: string, quantity: string, note: string) => {
    setShoppingItems((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name,
        quantity,
        note,
        done: false,
        createdAt: Date.now(),
      },
    ]);
  };

  const handleToggleShoppingItem = (id: string) => {
    setShoppingItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );
  };

  const handleRemoveShoppingItem = (id: string) => {
    setShoppingItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearPurchasedShoppingItems = () => {
    setShoppingItems((prev) => prev.filter((item) => !item.done));
  };

  useEffect(() => {
    if (!loggedIn || !authToken) return;
    if (autoPushAttemptedRef.current) return;
    autoPushAttemptedRef.current = true;

    const autoRegisterPush = async () => {
      try {
        const token = await registerForPush(t);
        if (token.startsWith("ExponentPushToken[")) {
          setPushToken(token);
          setPushState(t("state_push_token_generated"));
          await apiPost(apiBase, "/push/register", { token }, authToken);
        } else {
          setPushState(token);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "";
        if (errorMessage.includes("missing_eas_project_id")) {
          setPushState(t("push_missing_project_id"));
          return;
        }
        if (errorMessage.includes("missing_firebase_config")) {
          setPushState(t("push_missing_firebase"));
          return;
        }
        setPushState(t("state_push_error"));
      }
    };

    void autoRegisterPush();
  }, [loggedIn, authToken, apiBase, t]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
    <ThemeContext.Provider value={{ mode: themeMode, palette, toggleTheme }}>
      <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" backgroundColor="#00A651" />
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthBootstrapping ? (
          <RootStack.Screen name="Login">
            {() => (
              <SafeAreaView style={[styles.screen, { backgroundColor: palette.bg }]}>
                <View style={styles.loginWrap}>
                  <Image source={logoImage} style={styles.logoImage} resizeMode="contain" />
                  <Text style={[styles.screenSubtitle, { color: palette.muted }]}>{t("loading_profile")}</Text>
                </View>
              </SafeAreaView>
            )}
          </RootStack.Screen>
        ) : !loggedIn ? (
          <RootStack.Screen name="Login">
            {() => (
              <LoginScreen
                onEmailLogin={handleEmailLogin}
                onRegister={handleRegister}
                onSocial={handleSocialLogin}
                error={authError}
                language={language}
                onSetLanguage={setLanguage}
              />
            )}
          </RootStack.Screen>
        ) : (
          <RootStack.Screen name="Main">
            {() => (
              <MainTabs
                user={user}
                flyers={flyers}
                currentFlyers={currentFlyers}
                bestDeals={bestDeals}
                homeTopItem={homeTopItem}
                notices={notices}
                card={card}
                shoppingItems={shoppingItems}
                pushToken={pushToken}
                pushState={pushState}
                profileState={profileState}
                language={language}
                onAddShoppingItem={handleAddShoppingItem}
                onToggleShoppingItem={handleToggleShoppingItem}
                onRemoveShoppingItem={handleRemoveShoppingItem}
                onClearPurchasedShoppingItems={handleClearPurchasedShoppingItems}
                onSetLanguage={setLanguage}
                onScanCard={handleScanCard}
                onDeleteCard={handleDeleteCard}
                onLoadLoyaltyPurchases={handleLoadLoyaltyPurchases}
                onLoadLoyaltyPoints={handleLoadLoyaltyPoints}
                onCheckPrice={handleCheckPrice}
                onUpdateProfile={handleUpdateProfile}
                onChangePassword={handleChangePassword}
                onRegisterPush={handlePushRegister}
                onSendTestPush={handleSendTestPush}
                onRefresh={handleRefresh}
                onLogout={handleLogout}
              />
            )}
          </RootStack.Screen>
        )}
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
    </ThemeContext.Provider>
    </I18nContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBrandBar: {
    backgroundColor: "#00A651",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    overflow: "hidden",
  },
  topBrandLogo: {
    width: 640,
    height: 156,
    marginTop: 0,
    position: "absolute",
    top: 0,
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
    width: 213,
    height: 125,
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
    paddingBottom: 56,
  },
  scannerWrap: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerCamera: {
    flex: 1,
  },
  scannerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    gap: 8,
  },
  scannerTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  scannerHint: {
    color: "#F3F3F3",
    fontSize: 14,
    textAlign: "center",
  },
  scannerCloseBtn: {
    marginTop: 8,
    minWidth: 120,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerCloseBtnText: {
    color: colors.dark,
    fontSize: 15,
    fontWeight: "700",
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
  scanBtn: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.green,
    borderRadius: 10,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  scanBtnText: {
    color: colors.green,
    fontSize: 16,
    fontWeight: "700",
  },
  scanStatusText: {
    color: colors.gray,
    fontSize: 13,
    marginTop: -2,
    marginBottom: 10,
    textAlign: "center",
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
  cardDeleteBtn: {
    backgroundColor: "#b71c1c",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  cardDeleteBtnText: {
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
    borderRadius: 10,
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
  loginLangRow: {
    flexDirection: "row",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 4,
    gap: 8,
  },
  loginLangDock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  loginLangChip: {
    minWidth: 58,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  loginLangChipPressed: {
    opacity: 0.86,
  },
  loginLangChipActive: {
    borderColor: colors.green,
    backgroundColor: colors.green,
  },
  loginLangText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
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
  quickListBtn: {
    backgroundColor: "#F8F8F8",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  quickListBtnText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: "800",
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
  langRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  langChip: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  langChipActive: {
    borderColor: colors.green,
    backgroundColor: "#E8F7EE",
  },
  langChipText: {
    color: colors.gray,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  langChipTextActive: {
    color: colors.green,
  },
  homeFixedWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  homeScrollContent: {
    paddingTop: 0,
  },
  themeToggleBtn: {
    position: "absolute",
    right: 16,
    bottom: 6,
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  homeTopBrandBar: {
    alignSelf: "stretch",
    minHeight: 0,
    backgroundColor: "#00A651",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 0,
    overflow: "hidden",
  },
  homeTopBrandLogo: {
    width: 640,
    height: 156,
    marginTop: 0,
    position: "absolute",
    top: 0,
  },
  homeTopFieldWrap: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 2,
  },
  homeTopFieldImage: {
    width: "100%",
    alignSelf: "center",
  },
  showcaseSection: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  outlinedTitleWrap: {
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  showcaseHeaderMain: {
    color: "#10964A",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 18,
    textAlign: "center",
    textShadowColor: "#0A5D30",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1,
    includeFontPadding: false,
  },
  currentFlyersRow: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 10,
  },
  currentFlyerCard: {
    borderRadius: 10,
    padding: 2,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  currentFlyerImage: {
    width: "100%",
    height: "100%",
    alignSelf: "center",
  },
  currentFlyerPdfCard: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F8F8F8",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    position: "relative",
    overflow: "hidden",
  },
  currentFlyerPdfWebView: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
  },
  currentFlyerPdfBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(179,31,31,0.92)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  currentFlyerPdfBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  currentFlyerPdfLabel: {
    color: "#B31F1F",
    fontSize: 13,
    fontWeight: "800",
  },
  pdfModalHeader: {
    height: 56,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pdfModalTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  pdfModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  pdfModalWebView: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  pdfProgressWrap: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  pdfProgressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D8D8D8",
    overflow: "hidden",
  },
  pdfProgressFill: {
    height: "100%",
    backgroundColor: "#0A8F43",
  },
  pdfProgressText: {
    fontSize: 12,
    fontWeight: "700",
  },
  mockFlyerTag: {
    color: "#D8F7E6",
    fontSize: 11,
    fontWeight: "800",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentFlyerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 19,
  },
  currentFlyerPrice: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  bestDealsSection: {
    minHeight: 180,
  },
  bestDealsGrid: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    rowGap: 8,
    gap: 8,
  },
  bestDealsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 8,
  },
  bestDealCard: {
    width: "48.8%",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    overflow: "hidden",
    minHeight: 228,
    position: "relative",
  },
  bestDealMainBtn: {
    flex: 1,
    justifyContent: "space-between",
  },
  bestDealHeartBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 3,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE9D7",
  },
  bestDealImageWrap: {
    height: 105,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECEC",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bestDealImage: {
    width: "100%",
    height: "100%",
    alignSelf: "center",
  },
  bestDealInfoWrap: {
    marginTop: 8,
    gap: 2,
  },
  bestDealName: {
    color: "#4A4A4A",
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 17,
  },
  bestDealSub: {
    color: "#7A7A7A",
    fontSize: 12,
    fontWeight: "600",
    minHeight: 16,
  },
  bestDealBottomRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    gap: 6,
  },
  bestDealBadgeWrap: {
    backgroundColor: "#0A8F43",
    borderRadius: 4,
    overflow: "hidden",
    minWidth: 58,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  bestDealBadgePrice: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
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
    textAlign: "center",
  },
  flyerPrice: {
    color: colors.green,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 4,
    textAlign: "center",
  },
  flyerOpenBtn: {
    marginTop: 8,
    alignSelf: "center",
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  flyerOpenBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  analyticsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  analyticsTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  analyticsFilterRow: {
    flexDirection: "row",
    gap: 8,
  },
  analyticsDateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "600",
  },
  analyticsDateBtn: {
    justifyContent: "center",
  },
  analyticsDateBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  analyticsClearBtn: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  analyticsClearBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  analyticsStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  analyticsStatBox: {
    width: "48%",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  analyticsStatLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  analyticsStatValue: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.green,
  },
  analyticsSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  analyticsPurchasesToggleBtn: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  analyticsPurchasesToggleText: {
    fontSize: 15,
    fontWeight: "800",
  },
  analyticsPieWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  analyticsLegend: {
    flex: 1,
    gap: 6,
  },
  analyticsLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  analyticsLegendColor: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  analyticsLegendText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  analyticsEmptyText: {
    fontSize: 13,
    fontWeight: "600",
  },
  analyticsPurchaseRow: {
    borderBottomWidth: 1,
    paddingVertical: 7,
    gap: 2,
  },
  analyticsMarketGroup: {
    marginTop: 8,
  },
  analyticsMarketTitle: {
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 2,
  },
  analyticsPurchaseName: {
    fontSize: 13,
    fontWeight: "800",
  },
  analyticsPurchaseMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  priceResultCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  priceResultTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  priceResultName: {
    fontSize: 18,
    fontWeight: "900",
  },
  priceResultValue: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.green,
    marginTop: 2,
  },
  priceResultMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  shoppingForm: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  shoppingInput: {
    marginBottom: 8,
  },
  shoppingQtyInput: {
    marginBottom: 8,
    maxWidth: 110,
  },
  shoppingClearBtn: {
    marginBottom: 0,
  },
  shoppingEmptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  shoppingEmptyText: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  shoppingItemCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  shoppingToggleWrap: {
    paddingTop: 2,
  },
  shoppingTextWrap: {
    flex: 1,
    gap: 2,
  },
  shoppingItemName: {
    fontSize: 15,
    fontWeight: "800",
  },
  shoppingMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  shoppingDeleteBtn: {
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 1,
  },
  flyersScreenTitle: {
    color: "#10964A",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1,
    includeFontPadding: false,
  },
  flyersScreenSubtitle: {
    textAlign: "center",
  },
  cardBox: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardDataBox: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  cardDataTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  cardDataPointsValue: {
    color: colors.green,
    fontWeight: "900",
  },
  cardDataEmpty: {
    fontSize: 13,
    fontWeight: "600",
  },
  cardPurchaseRow: {
    paddingVertical: 7,
    borderBottomWidth: 1,
  },
  cardPurchaseName: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardPurchaseMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "600",
  },
  cardLogo: {
    width: 110,
    height: 56,
    alignSelf: "center",
    marginBottom: 8,
  },
  cardPreviewImage: {
    width: "100%",
    height: 170,
    alignSelf: "center",
    marginBottom: 10,
    borderRadius: 12,
  },
  cardBackWrap: {
    width: "100%",
    alignSelf: "center",
    aspectRatio: 700 / 452,
    position: "relative",
  },
  cardBackImage: {
    width: "100%",
    height: "100%",
  },
  cardBackBarcodeWrap: {
    position: "absolute",
    left: "24.1%",
    top: "40.9%",
    width: "48%",
    height: "19.5%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  cardBackBarcodeDigits: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#111111",
  },
  cardNumber: {
    textAlign: "center",
    fontSize: 16,
    color: colors.gray,
    marginBottom: 12,
  },
  barcodeWrap: {
    backgroundColor: "#FCFCFC",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 2,
  },
  barcodeCanvas: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
  },
  barcodeBar: {
    backgroundColor: "#111111",
    height: "100%",
    marginRight: 1,
  },
  barcodeDigits: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "900",
    color: colors.dark,
    letterSpacing: 2,
    marginTop: 8,
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
  notificationMediaImage: {
    marginTop: 8,
    width: "100%",
    height: 170,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F7F7F7",
  },
  notificationPdfCard: {
    marginTop: 8,
    width: "100%",
    height: 170,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    backgroundColor: "#F7F7F7",
  },
  notificationPdfFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  notificationPdfFallbackText: {
    color: "#B31F1F",
    fontSize: 14,
    fontWeight: "800",
  },
  notificationTime: {
    marginTop: 8,
    color: colors.green,
    fontWeight: "700",
  },
  locationSection: {
    marginBottom: 14,
    gap: 8,
  },
  locationSearchInput: {
    marginBottom: 8,
  },
  locationCityChipsRow: {
    paddingBottom: 10,
    gap: 8,
    paddingHorizontal: 2,
  },
  locationCityChip: {
    borderWidth: 1,
    borderRadius: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    justifyContent: "center",
  },
  locationCityChipText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  locationCityTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  locationCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  locationName: {
    fontSize: 15,
    fontWeight: "900",
  },
  locationAddress: {
    fontSize: 13,
    lineHeight: 18,
  },
  locationCoords: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  locationMapBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#B8E5C7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    backgroundColor: "#F3FBF6",
  },
  locationMapBtnText: {
    color: colors.green,
    fontSize: 13,
    fontWeight: "800",
  },
});

