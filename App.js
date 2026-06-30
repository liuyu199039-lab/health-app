import { useState, useEffect, useRef } from "react";
import {
  View, Text, Image, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, StatusBar, SafeAreaView, Alert,
  Animated, Modal
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import Svg, { Circle } from "react-native-svg";
import { LineChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";
// 卡片图片高度：全屏宽 - scroll padding(32) - card padding(28)，按 3:4 竖拍比例
const RECIPE_IMG_W = Dimensions.get("window").width - 60;
const RECIPE_IMG_H = Math.round(RECIPE_IMG_W * 4 / 3);

// ⚠️ 把你的 API Key 填在下面引号里
const API_KEY = "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";

const MEAL_LABELS = [
  { label: "早餐", emoji: "🌅", color: "#6ee7b7" },
  { label: "午餐", emoji: "☀️", color: "#f59e0b" },
  { label: "晚餐", emoji: "🌙", color: "#818cf8" },
];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const BODY_FIELDS = [
  { key: "height", label: "身高", unit: "cm" },
  { key: "weight", label: "体重", unit: "kg" },
  { key: "bmr", label: "基础代谢", unit: "kcal" },
  { key: "chest", label: "胸围", unit: "cm" },
  { key: "waist", label: "腰围", unit: "cm" },
  { key: "lowerAbdomen", label: "下腹围", unit: "cm" },
  { key: "hip", label: "臀围", unit: "cm" },
  { key: "arm", label: "手臂围", unit: "cm" },
  { key: "thigh", label: "大腿围", unit: "cm" },
  { key: "calf", label: "小腿围", unit: "cm" },
];

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── 主题配色 ──
const THEMES = {
  dark: {
    name: "黑色", swatch: "#16161e",
    bg: "#16161e", surface: "#1e1e28", surface2: "#1a1a24", surface3: "#252530",
    navBg: "#1a1a22", navBorder: "#1e1e26", border: "#252535", border2: "#2a2a3a",
    dangerBg: "#2a1f24",
    text: "#e0e0e0", text2: "#bbb", textDim: "#888", textMute: "#555", textFaint: "#3a3a4a",
    statusBar: "light-content",
  },
  light: {
    name: "白色", swatch: "#ffffff",
    bg: "#f5f5f7", surface: "#ffffff", surface2: "#ffffff", surface3: "#ececed",
    navBg: "#ffffff", navBorder: "#e5e5ea", border: "#e5e5ea", border2: "#dcdce0",
    dangerBg: "#fde8e8",
    text: "#1a1a1a", text2: "#444", textDim: "#888", textMute: "#aaa", textFaint: "#c5c5c9",
    statusBar: "dark-content",
  },
  pink: {
    name: "粉色", swatch: "#f8c8d8",
    bg: "#fdf2f6", surface: "#ffffff", surface2: "#fce8ef", surface3: "#fad9e4",
    navBg: "#ffffff", navBorder: "#f5d5e0", border: "#f5d5e0", border2: "#efc4d3",
    dangerBg: "#fde0e0",
    text: "#5a2a3a", text2: "#8a5a6a", textDim: "#a87888", textMute: "#c9a0ad", textFaint: "#e0c0ca",
    statusBar: "dark-content",
  },
  blue: {
    name: "蓝色", swatch: "#cfe3f7",
    bg: "#eef4fb", surface: "#ffffff", surface2: "#e3eef9", surface3: "#d6e6f5",
    navBg: "#ffffff", navBorder: "#d0e0f0", border: "#d0e0f0", border2: "#bdd4ea",
    dangerBg: "#fde0e0",
    text: "#1e3a5a", text2: "#3a5a7a", textDim: "#6a88a8", textMute: "#9ab2cc", textFaint: "#c0d4e6",
    statusBar: "dark-content",
  },
};
const THEME_KEYS = ["dark", "light", "pink", "blue"];

// 打开数据库
const db = SQLite.openDatabaseSync("health.db");

// 初始化表
function initDB() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS meals (
      date TEXT, slot INTEGER, summary TEXT, cal INTEGER, p INTEGER, c INTEGER, f INTEGER, uri TEXT,
      PRIMARY KEY (date, slot)
    );
    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, name TEXT, duration INTEGER, cal INTEGER
    );
    CREATE TABLE IF NOT EXISTS profile (
      key TEXT PRIMARY KEY, value TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT
    );
    CREATE TABLE IF NOT EXISTS body_history (
      date TEXT PRIMARY KEY,
      height REAL, weight REAL, bmr REAL, chest REAL, waist REAL,
      lowerAbdomen REAL, hip REAL, arm REAL, thigh REAL, calf REAL
    );
    CREATE TABLE IF NOT EXISTS fav_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, cal INTEGER
    );
    CREATE TABLE IF NOT EXISTS snacks (
      date TEXT PRIMARY KEY, cal INTEGER
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, cal INTEGER, p INTEGER, c INTEGER, f INTEGER,
      photoUri TEXT, methodUri TEXT
    );
  `);
}

async function callClaude(messages, maxTokens = 1000) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages }),
  });
  const res = await resp.json();
  if (res.type === "error") throw new Error(JSON.stringify(res.error));
  return res.content?.find(b => b.type === "text")?.text || "";
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState(0);
  const [currentMeal, setCurrentMeal] = useState(0);
  const [meals, setMeals] = useState([null, null, null]);
  const [analyzing, setAnalyzing] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [exLoading, setExLoading] = useState({});
  const [profile, setProfile] = useState({});
  const [goalKg, setGoalKg] = useState("");
  const [allMonthData, setAllMonthData] = useState({}); // 日历用：{ "2026-06-15": netExpenditure }
  const [selDateStr, setSelDateStr] = useState(dateKey(new Date())); // 当前查看的日期
  const [bodyHistory, setBodyHistory] = useState([]);
  const [chartMetric, setChartMetric] = useState("weight");
  const [favExercises, setFavExercises] = useState([]);
  const [showExLib, setShowExLib] = useState(false); // 运动页是否显示"常用运动库"
  const [snackCal, setSnackCal] = useState("");
  const [themeKey, setThemeKey] = useState("dark");
  const [showSettings, setShowSettings] = useState(false);
  const [showRecipeBook, setShowRecipeBook] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [mealPickModal, setMealPickModal] = useState(null); // recipe obj waiting for meal slot pick
  const t = THEMES[themeKey] || THEMES.dark;
  const styles = makeStyles(t);

  const today = new Date();
  const todayStr = dateKey(today);
  const selParts = selDateStr.split("-").map(Number);
  const selDateObj = new Date(selParts[0], selParts[1] - 1, selParts[2]);
  const isToday = selDateStr === todayStr;
  const dateDisplay = `${selParts[0]} 年 ${selParts[1]} 月 ${selParts[2]} 日 · 周${WEEKDAYS[selDateObj.getDay()]}`;

  // ── 启动：初始化数据库 ──
  useEffect(() => {
    initDB();
    loadProfile();
    loadGoal();
    loadBodyHistory();
    loadFavExercises();
    loadTheme();
    loadRecipes();
    setReady(true);
  }, []);

  // 每当选中日期变化，重新读取那天的饮食和运动
  useEffect(() => {
    if (!ready) return;
    loadDay(selDateStr);
  }, [selDateStr, ready]);

  function loadDay(dStr) {
    // 读餐食
    const mealRows = db.getAllSync("SELECT * FROM meals WHERE date = ?", [dStr]);
    const m = [null, null, null];
    mealRows.forEach(r => { m[r.slot] = { summary: r.summary, cal: r.cal, p: r.p, c: r.c, f: r.f, uri: r.uri }; });
    setMeals(m);
    // 读运动
    const exRows = db.getAllSync("SELECT * FROM exercises WHERE date = ?", [dStr]);
    setExercises(exRows.map(r => ({ id: r.id, name: r.name, duration: String(r.duration), cal: r.cal })));
    // 读加餐
    const snackRows = db.getAllSync("SELECT cal FROM snacks WHERE date = ?", [dStr]);
    setSnackCal(snackRows.length && snackRows[0].cal ? String(snackRows[0].cal) : "");
  }

  function loadRecipes() {
    setRecipes(db.getAllSync("SELECT * FROM recipes ORDER BY id DESC"));
  }
  async function saveRecipe(name, cal, p, c, f, photoUri, methodUri) {
    const dir = FileSystem.documentDirectory + "recipes/";
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const id = Date.now();
    let permPhoto = photoUri;
    let permMethod = methodUri;
    try {
      permPhoto = dir + `recipe_${id}_photo.jpg`;
      await FileSystem.copyAsync({ from: photoUri, to: permPhoto });
    } catch { permPhoto = photoUri; }
    try {
      permMethod = dir + `recipe_${id}_method.jpg`;
      await FileSystem.copyAsync({ from: methodUri, to: permMethod });
    } catch { permMethod = methodUri; }
    db.runSync(
      "INSERT INTO recipes (name, cal, p, c, f, photoUri, methodUri) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, parseInt(cal) || 0, parseInt(p) || 0, parseInt(c) || 0, parseInt(f) || 0, permPhoto, permMethod]
    );
    loadRecipes();
  }
  function deleteRecipe(id) {
    db.runSync("DELETE FROM recipes WHERE id = ?", [id]);
    loadRecipes();
  }
  function addRecipeToMeal(recipe, slot) {
    db.runSync(
      "INSERT OR REPLACE INTO meals (date, slot, summary, cal, p, c, f, uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [selDateStr, slot, recipe.name, recipe.cal, recipe.p, recipe.c, recipe.f, recipe.photoUri]
    );
    const newMeals = [...meals];
    newMeals[slot] = { summary: recipe.name, cal: recipe.cal, p: recipe.p, c: recipe.c, f: recipe.f, uri: recipe.photoUri };
    setMeals(newMeals);
  }

  function loadFavExercises() {
    setFavExercises(db.getAllSync("SELECT * FROM fav_exercises ORDER BY id DESC"));
  }
  function addFavExercise(name, cal) {
    db.runSync("INSERT INTO fav_exercises (name, cal) VALUES (?, ?)", [name, parseInt(cal) || 0]);
    loadFavExercises();
  }
  function removeFavExercise(id) {
    db.runSync("DELETE FROM fav_exercises WHERE id = ?", [id]);
    loadFavExercises();
  }
  // 从常用库添加一条到今天的运动
  function addExerciseFromFav(fav) {
    const res = db.runSync("INSERT INTO exercises (date, name, duration, cal) VALUES (?, ?, 0, ?)", [selDateStr, fav.name, fav.cal]);
    setExercises(prev => [...prev, { id: res.lastInsertRowId, name: fav.name, duration: "", cal: fav.cal }]);
  }
  function saveSnack(value) {
    setSnackCal(value);
    db.runSync("INSERT OR REPLACE INTO snacks (date, cal) VALUES (?, ?)", [selDateStr, parseInt(value) || 0]);
  }
  // 手动修改餐食的某个数值
  function editMealField(slot, field, value) {
    const num = parseInt(value) || 0;
    setMeals(prev => {
      const m = [...prev];
      if (m[slot]) {
        m[slot] = { ...m[slot], [field]: num };
        db.runSync(`UPDATE meals SET ${field} = ? WHERE date = ? AND slot = ?`, [num, selDateStr, slot]);
      }
      return m;
    });
  }

  function loadProfile() {
    const rows = db.getAllSync("SELECT * FROM profile");
    const p = {};
    rows.forEach(r => { p[r.key] = r.value; });
    setProfile(p);
  }

  function loadBodyHistory() {
    const rows = db.getAllSync("SELECT * FROM body_history ORDER BY date ASC");
    setBodyHistory(rows);
  }

  function saveBodyToday() {
    const f = k => { const v = parseFloat(profile[k]); return isNaN(v) ? null : v; };
    db.runSync(
      `INSERT OR REPLACE INTO body_history
        (date, height, weight, bmr, chest, waist, lowerAbdomen, hip, arm, thigh, calf)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [todayStr, f("height"), f("weight"), f("bmr"), f("chest"), f("waist"),
       f("lowerAbdomen"), f("hip"), f("arm"), f("thigh"), f("calf")]
    );
    loadBodyHistory();
    Alert.alert("已记录", `${todayStr} 的身体数据已保存`);
  }

  function loadGoal() {
    const rows = db.getAllSync("SELECT value FROM settings WHERE key = 'goalKg'");
    if (rows.length) setGoalKg(rows[0].value);
  }

  function loadTheme() {
    const rows = db.getAllSync("SELECT value FROM settings WHERE key = 'theme'");
    if (rows.length && THEMES[rows[0].value]) setThemeKey(rows[0].value);
  }
  function saveTheme(key) {
    setThemeKey(key);
    db.runSync("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)", [key]);
  }

  // 计算某月每天净支出（日历用）
  function loadMonthData(year, month) {
    const bmr = parseInt(profile.bmr) || 0;
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const mealRows = db.getAllSync("SELECT date, SUM(cal) as total FROM meals WHERE date LIKE ? GROUP BY date", [prefix + "%"]);
    const exRows = db.getAllSync("SELECT date, SUM(cal) as total FROM exercises WHERE date LIKE ? GROUP BY date", [prefix + "%"]);
    const snackRows = db.getAllSync("SELECT date, cal FROM snacks WHERE date LIKE ?", [prefix + "%"]);
    const intake = {}; mealRows.forEach(r => { intake[r.date] = r.total; });
    const exer = {}; exRows.forEach(r => { exer[r.date] = r.total; });
    const snack = {}; snackRows.forEach(r => { snack[r.date] = r.cal || 0; });
    const allDates = new Set([...Object.keys(intake), ...Object.keys(snack)]);
    const out = {};
    allDates.forEach(d => {
      const totalIn = (intake[d] || 0) + (snack[d] || 0);
      if (bmr && totalIn) out[d] = totalIn - bmr - (exer[d] || 0);
    });
    setAllMonthData(out);
  }

  // ── 拍照分析 ──
  async function pickImage() {
    if (analyzing) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("需要相册权限", "请在设置里允许访问相册"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setAnalyzing(true);
    try {
      const mp = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      const text = await callClaude([{
        role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: mp.base64 } },
          { type: "text", text: '请分析这张餐食图片，用中文输出 JSON，不要加任何说明文字，格式：{"summary":"食物描述30字以内","cal":数字,"p":数字,"c":数字,"f":数字}，cal是总千卡，p=蛋白质克，c=碳水克，f=脂肪克。' }
        ]
      }]);
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      // 把图片复制到 App 永久目录，避免临时缓存被系统清理
      let permUri = mp.uri;
      try {
        const dir = FileSystem.documentDirectory + "meals/";
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        permUri = dir + `${selDateStr}_${currentMeal}.jpg`;
        await FileSystem.copyAsync({ from: mp.uri, to: permUri });
      } catch (copyErr) {
        permUri = mp.uri; // 复制失败就退回临时路径
      }
      const meal = { ...parsed, uri: permUri };
      // 存数据库
      db.runSync(
        "INSERT OR REPLACE INTO meals (date, slot, summary, cal, p, c, f, uri) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [selDateStr, currentMeal, meal.summary, meal.cal, meal.p, meal.c, meal.f, meal.uri]
      );
      const newMeals = [...meals];
      newMeals[currentMeal] = meal;
      setMeals(newMeals);
    } catch (e) {
      Alert.alert("分析失败", String(e.message || e));
    }
    setAnalyzing(false);
  }

  function deleteMeal() {
    db.runSync("DELETE FROM meals WHERE date = ? AND slot = ?", [selDateStr, currentMeal]);
    const newMeals = [...meals];
    newMeals[currentMeal] = null;
    setMeals(newMeals);
  }

  // ── 运动 ──
  function addExercise() {
    const res = db.runSync("INSERT INTO exercises (date, name, duration, cal) VALUES (?, '', 0, NULL)", [selDateStr]);
    setExercises(prev => [...prev, { id: res.lastInsertRowId, name: "", duration: "", cal: null }]);
  }
  function updateExercise(id, field, value) {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    if (field === "name") db.runSync("UPDATE exercises SET name = ? WHERE id = ?", [value, id]);
    if (field === "duration") db.runSync("UPDATE exercises SET duration = ? WHERE id = ?", [parseInt(value) || 0, id]);
  }
  function removeExercise(id) {
    db.runSync("DELETE FROM exercises WHERE id = ?", [id]);
    setExercises(prev => prev.filter(e => e.id !== id));
  }
  async function calcExercise(id, name, duration) {
    if (!name.trim() || !duration) return;
    const ex = exercises.find(e => e.id === id);
    if (ex && ex.cal) return;
    setExLoading(prev => ({ ...prev, [id]: true }));
    try {
      const w = parseInt(profile.weight) || 60;
      const text = await callClaude([{
        role: "user",
        content: `一个体重${w}kg的人做"${name}"运动${duration}分钟，大约消耗多少卡路里？只输出一个整数，不要任何其他文字。`
      }], 100);
      const num = parseInt(text.replace(/[^\d]/g, ""));
      const cal = !isNaN(num) && num > 0 ? num : Math.round(parseInt(duration) * 5.5);
      db.runSync("UPDATE exercises SET cal = ? WHERE id = ?", [cal, id]);
      setExercises(prev => prev.map(e => e.id === id ? { ...e, cal } : e));
    } catch {
      const cal = Math.round(parseInt(duration) * 5.5);
      db.runSync("UPDATE exercises SET cal = ? WHERE id = ?", [cal, id]);
      setExercises(prev => prev.map(e => e.id === id ? { ...e, cal } : e));
    }
    setExLoading(prev => ({ ...prev, [id]: false }));
  }
  function exerciseBlur(id, name, duration) {
    const ex = exercises.find(e => e.id === id);
    if (ex && name.trim() && duration && !ex.cal && !exLoading[id]) calcExercise(id, name, duration);
  }

  // ── 个人资料 ──
  function saveProfile(key, value) {
    setProfile(p => ({ ...p, [key]: value }));
    db.runSync("INSERT OR REPLACE INTO profile (key, value) VALUES (?, ?)", [key, value]);
  }

  // ── 目标 ──
  function saveGoal(value) {
    setGoalKg(value);
    db.runSync("INSERT OR REPLACE INTO settings (key, value) VALUES ('goalKg', ?)", [value]);
  }

  // ── 计算 ──
  const snackCalNum = parseInt(snackCal) || 0;
  const totalCal = meals.reduce((s, m) => s + (m?.cal || 0), 0) + snackCalNum;
  const exCal = exercises.reduce((s, e) => s + (e.cal || 0), 0);
  const bmr = parseInt(profile.bmr) || 0;
  const net = (bmr && (totalCal || exCal)) ? totalCal - bmr - exCal : null;
  const goalCal = goalKg ? Math.round(parseFloat(goalKg) * 7700) : 0;

  const data = meals[currentMeal];
  let macros = null;
  if (data) {
    const t = data.p * 4 + data.c * 4 + data.f * 9 || 1;
    macros = { pp: Math.round(data.p*4/t*100), cp: Math.round(data.c*4/t*100), fp: Math.round(data.f*9/t*100) };
  }

  const displayEx = exercises.length >= 3 ? exercises :
    [...exercises, ...Array(3 - exercises.length).fill(null).map((_, i) => ({ id: `e${i}`, name: "", duration: "", cal: null }))];

  const NAV = [
    { icon: "🍽", label: "记录" },
    { icon: "🏃", label: "运动" },
    { icon: "📅", label: "日历" },
    { icon: "👤", label: "我的" },
  ];

  // 切到日历页时，计算当月数据
  function goToCalendar() {
    loadMonthData(today.getFullYear(), today.getMonth());
    setTab(2);
  }

  if (!ready) {
    return <SafeAreaView style={styles.safe}><View style={{flex:1,justifyContent:"center",alignItems:"center"}}><ActivityIndicator color="#6ee7b7" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle={t.statusBar} />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ════════ 记录 ════════ */}
        {tab === 0 && !showRecipeBook && (<>
          <View style={styles.recHeader}>
            <Text style={styles.title}>{isToday ? "今日记录" : "历史记录"}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity onPress={() => setShowRecipeBook(true)} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>📖 菜谱册</Text>
              </TouchableOpacity>
              {!isToday && (
                <TouchableOpacity onPress={() => setSelDateStr(todayStr)} style={styles.todayBtn}>
                  <Text style={styles.todayBtnText}>回到今天</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.dateNav}>
            <TouchableOpacity onPress={() => {
              const d = new Date(selDateObj); d.setDate(d.getDate() - 1); setSelDateStr(dateKey(d));
            }}><Text style={styles.dateNavArrow}>‹</Text></TouchableOpacity>
            <Text style={[styles.date, { marginBottom: 0, marginTop: 0 }]}>{dateDisplay}</Text>
            <TouchableOpacity onPress={() => {
              const d = new Date(selDateObj); d.setDate(d.getDate() + 1);
              const nd = dateKey(d);
              if (nd <= todayStr) setSelDateStr(nd);
            }}><Text style={[styles.dateNavArrow, { color: selDateStr >= todayStr ? t.border2 : "#6ee7b7" }]}>›</Text></TouchableOpacity>
          </View>
          <View style={styles.tabs}>
            {MEAL_LABELS.map((m, i) => (
              <TouchableOpacity key={i} onPress={() => setCurrentMeal(i)} style={[styles.tab, currentMeal === i && styles.tabActive]}>
                <Text style={styles.tabEmoji}>{m.emoji}</Text>
                <Text style={[styles.tabLabel, currentMeal === i && styles.tabLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.upload} onPress={pickImage} activeOpacity={0.8}>
            {data?.uri ? <Image source={{ uri: data.uri }} style={styles.previewImg} /> : (
              <View style={styles.uploadInner}>
                <Text style={{ fontSize: 28 }}>📷</Text>
                <Text style={styles.uploadText}>点击上传餐食照片</Text>
                <Text style={styles.uploadHint}>AI 自动识别食物并分析营养</Text>
              </View>
            )}
          </TouchableOpacity>
          {analyzing && (
            <View style={styles.analyzing}>
              <ActivityIndicator color="#6ee7b7" />
              <Text style={styles.analyzingText}>AI 正在分析食物成分…</Text>
            </View>
          )}
          {data && !analyzing && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>食物概要</Text>
              <Text style={styles.summary}>{data.summary}</Text>
              <View style={styles.calRow}>
                <TextInput
                  value={String(data.cal)}
                  onChangeText={(v) => editMealField(currentMeal, "cal", v)}
                  keyboardType="number-pad"
                  style={styles.calNumInput}
                />
                <Text style={styles.calUnit}>千卡（可点击修改）</Text>
              </View>
              <View style={styles.macros}>
                <MacroEdit styles={styles} val={data.p} label="蛋白质" color="#60a5fa" pct={macros.pp} onChange={(v) => editMealField(currentMeal, "p", v)} />
                <MacroEdit styles={styles} val={data.c} label="碳水" color="#f59e0b" pct={macros.cp} onChange={(v) => editMealField(currentMeal, "c", v)} />
                <MacroEdit styles={styles} val={data.f} label="脂肪" color="#f87171" pct={macros.fp} onChange={(v) => editMealField(currentMeal, "f", v)} />
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={deleteMeal}>
                <Text style={styles.deleteBtnText}>🗑 删除这条记录</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 加餐 */}
          <View style={styles.snackCard}>
            <Text style={styles.snackLabel}>🍪 加餐</Text>
            <TextInput
              value={snackCal}
              onChangeText={saveSnack}
              placeholder="0" placeholderTextColor={t.textFaint} keyboardType="number-pad"
              style={styles.snackInput}
            />
            <Text style={styles.snackUnit}>kcal</Text>
          </View>

          <View style={styles.daily}>
            <View style={styles.dailyHeader}>
              <Text style={styles.dailyTitle}>今日汇总</Text>
              <Text style={styles.dailyTotal}>{totalCal > 0 ? totalCal + " kcal" : "—"}</Text>
            </View>
            {MEAL_LABELS.map((m, i) => (
              <View key={i} style={[styles.mealRow, styles.mealRowBorder]}>
                <View style={styles.mealNameWrap}>
                  <View style={[styles.dot, { backgroundColor: m.color }]} />
                  <Text style={styles.mealName}>{m.label}</Text>
                </View>
                <Text style={[styles.mealCal, { color: meals[i] ? t.text2 : t.textFaint }]}>{meals[i] ? meals[i].cal + " kcal" : "未记录"}</Text>
              </View>
            ))}
            {snackCalNum > 0 && (
              <View style={[styles.mealRow, styles.mealRowBorder]}>
                <View style={styles.mealNameWrap}>
                  <View style={[styles.dot, { backgroundColor: "#fbbf24" }]} />
                  <Text style={styles.mealName}>加餐</Text>
                </View>
                <Text style={[styles.mealCal, { color: t.text2 }]}>{snackCalNum} kcal</Text>
              </View>
            )}
            {exCal > 0 && (
              <View style={styles.mealRow}>
                <View style={styles.mealNameWrap}>
                  <View style={[styles.dot, { backgroundColor: "#818cf8" }]} />
                  <Text style={styles.mealName}>运动消耗</Text>
                </View>
                <Text style={[styles.mealCal, { color: "#818cf8" }]}>−{exCal} kcal</Text>
              </View>
            )}
            {net !== null && (
              <View style={styles.netRow}>
                <Text style={styles.netLabel}>今日净支出</Text>
                <Text style={[styles.netVal, { color: net <= 0 ? "#6ee7b7" : "#f87171" }]}>{net > 0 ? "+" : ""}{net} kcal</Text>
              </View>
            )}
          </View>
        </>)}

        {/* ════════ 菜谱册 ════════ */}
        {tab === 0 && showRecipeBook && (
          <RecipeBook
            styles={styles} t={t}
            recipes={recipes}
            onBack={() => setShowRecipeBook(false)}
            onSave={saveRecipe}
            onDelete={deleteRecipe}
            onAddToMeal={(recipe) => {
              setMealPickModal(recipe);
            }}
          />
        )}

        {/* ════════ 运动 ════════ */}
        {tab === 1 && !showExLib && (<>
          <View style={styles.recHeader}>
            <Text style={styles.title}>运动记录</Text>
            <TouchableOpacity onPress={() => setShowExLib(true)} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>⚙ 常用运动</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.date}>从常用运动中选择添加</Text>

          {/* 常用运动快速选择 */}
          {favExercises.length === 0 ? (
            <View style={styles.exEmptyBox}>
              <Text style={styles.exEmptyText}>还没有常用运动</Text>
              <TouchableOpacity onPress={() => setShowExLib(true)} style={styles.exEmptyBtn}>
                <Text style={styles.exEmptyBtnText}>去添加常用运动</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.favPickWrap}>
              {favExercises.map(fav => (
                <TouchableOpacity key={fav.id} style={styles.favPickChip} onPress={() => addExerciseFromFav(fav)}>
                  <Text style={styles.favPickName}>{fav.name}</Text>
                  <Text style={styles.favPickCal}>−{fav.cal}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 今日已添加的运动 */}
          {exercises.length > 0 && (
            <View style={styles.todayExBox}>
              <Text style={styles.todayExTitle}>今日运动</Text>
              {exercises.map(ex => (
                <View key={ex.id} style={styles.todayExRow}>
                  <Text style={styles.todayExName}>{ex.name}</Text>
                  <View style={styles.todayExRight}>
                    <Text style={styles.todayExCal}>−{ex.cal} kcal</Text>
                    <TouchableOpacity onPress={() => removeExercise(ex.id)}><Text style={styles.exDel}>×</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {exCal > 0 && (
            <View style={styles.exTotal}>
              <Text style={styles.exTotalLabel}>今日运动消耗</Text>
              <Text style={styles.exTotalVal}>−{exCal} kcal</Text>
            </View>
          )}
        </>)}

        {/* ════════ 常用运动管理 ════════ */}
        {tab === 1 && showExLib && (
          <ExerciseLibrary
            styles={styles}
            favExercises={favExercises}
            addFav={addFavExercise}
            removeFav={removeFavExercise}
            onBack={() => setShowExLib(false)}
          />
        )}

        {/* ════════ 日历 ════════ */}
        {tab === 2 && (
          <CalendarPage styles={styles} t={t} allMonthData={allMonthData} bmr={bmr} goalKg={goalKg} saveGoal={saveGoal} goalCal={goalCal} net={net}
            todayStr={todayStr}
            onPickDay={(dStr) => { setSelDateStr(dStr); setTab(0); }} />
        )}

        {/* ════════ 我的 ════════ */}
        {tab === 3 && !showSettings && (<>
          <View style={styles.recHeader}>
            <Text style={styles.title}>个人资料</Text>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>⚙ 设置</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.date}>填写身体指标（自动保存当前值）</Text>
          {BODY_FIELDS.map(({ key, label, unit }) => (
            <View key={key} style={styles.profileRow}>
              <Text style={styles.profileLabel}>{label}</Text>
              <TextInput
                value={profile[key] || ""}
                onChangeText={(v) => saveProfile(key, v)}
                placeholder="—" placeholderTextColor={t.textFaint} keyboardType="decimal-pad"
                style={styles.profileInput}
              />
              <Text style={styles.profileUnit}>{unit}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.recordBodyBtn} onPress={saveBodyToday}>
            <Text style={styles.recordBodyBtnText}>📌 记录今日数据</Text>
          </TouchableOpacity>

          <BodyTrend styles={styles} t={t} bodyHistory={bodyHistory} metric={chartMetric} setMetric={setChartMetric} />
        </>)}

        {/* ════════ 设置 ════════ */}
        {tab === 3 && showSettings && (<>
          <View style={styles.recHeader}>
            <Text style={styles.title}>设置</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>‹ 返回</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.date}>选择你喜欢的页面风格</Text>

          <View style={styles.themeGrid}>
            {THEME_KEYS.map(k => {
              const th = THEMES[k];
              const active = k === themeKey;
              return (
                <TouchableOpacity key={k} onPress={() => saveTheme(k)}
                  style={[styles.themeCard, { borderColor: active ? "#6ee7b7" : t.border2 }]}>
                  <View style={[styles.themeSwatch, { backgroundColor: th.swatch, borderColor: t.border2 }]}>
                    <View style={[styles.themeSwatchDot, { backgroundColor: "#6ee7b7" }]} />
                  </View>
                  <Text style={styles.themeName}>{th.name}</Text>
                  {active && <Text style={styles.themeActive}>✓ 使用中</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </>)}

      </ScrollView>

      <View style={styles.nav}>
        {NAV.map((n, i) => (
          <TouchableOpacity key={i} style={styles.navItem} onPress={() => { setShowRecipeBook(false); i === 2 ? goToCalendar() : setTab(i); }}>
            <Text style={styles.navIcon}>{n.icon}</Text>
            <Text style={[styles.navLabel, { color: tab === i ? "#6ee7b7" : t.textFaint }]}>{n.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 选餐次弹窗 ── */}
      <Modal transparent animationType="fade" visible={!!mealPickModal} onRequestClose={() => setMealPickModal(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMealPickModal(null)}>
          <View style={[styles.mealPickSheet, { backgroundColor: t.surface }]}>
            <Text style={[styles.mealPickTitle, { color: t.text }]}>添加到哪一餐？</Text>
            {MEAL_LABELS.map((m, i) => (
              <TouchableOpacity key={i} style={[styles.mealPickRow, { borderTopColor: t.border }]}
                onPress={() => {
                  if (mealPickModal) addRecipeToMeal(mealPickModal, i);
                  setMealPickModal(null);
                  setShowRecipeBook(false);
                  setTab(0);
                  Alert.alert("已添加", `${mealPickModal?.name} 已加到${m.label}`);
                }}>
                <Text style={{ fontSize: 20 }}>{m.emoji}</Text>
                <Text style={[styles.mealPickLabel, { color: t.text }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.mealPickCancel} onPress={() => setMealPickModal(null)}>
              <Text style={{ color: t.textDim, fontSize: 14 }}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function Ring({ pct, size = 120, stroke = 10, color = "#818cf8", track = "#252530", textColor = "#fff", subColor = "#555" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct, 0), 100) / 100 * circ;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} />
      </Svg>
      <Text style={{ color: textColor, fontSize: 26, fontWeight: "700" }}>{pct}%</Text>
      <Text style={{ color: subColor, fontSize: 11, marginTop: 2 }}>已完成</Text>
    </View>
  );
}

function CalendarPage({ styles, t, allMonthData, bmr, goalKg, saveGoal, goalCal, net, onPickDay, todayStr }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  let monthAchieved = 0;
  Object.values(allMonthData).forEach(v => { monthAchieved += -v; });
  const pct = goalCal > 0 ? Math.max(0, Math.min(100, Math.round(monthAchieved / goalCal * 100))) : 0;
  const remaining = goalCal - monthAchieved;

  return (
    <>
      <Text style={styles.title}>{year} 年 {month + 1} 月</Text>
      <Text style={styles.date}>点击日期可查看或补填 · 每格 = 摄入 − 代谢 − 运动</Text>

      <View style={styles.calWeek}>
        {WEEKDAYS.map(w => <Text key={w} style={styles.calWeekText}>{w}</Text>)}
      </View>
      <View style={styles.calGrid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.calCell} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const val = allMonthData[key];
          const isToday = d === today.getDate();
          const future = key > todayStr;
          const color = val == null ? "#555" : val <= 0 ? "#6ee7b7" : "#f87171";
          return (
            <TouchableOpacity key={i} style={[styles.calCell, isToday && styles.calCellToday]}
              disabled={future} activeOpacity={0.6}
              onPress={() => onPickDay(key)}>
              <Text style={[styles.calDay, { color: future ? "#333" : isToday ? "#6ee7b7" : "#bbb" }]}>{d}</Text>
              {val != null && <Text style={[styles.calVal, { color }]}>{val <= 0 ? "" : "+"}{val}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.goalCard}>
        <Text style={styles.goalLabel}>本月想瘦</Text>
        <View style={styles.goalInputRow}>
          <TextInput value={goalKg} onChangeText={saveGoal} placeholder="0.0" placeholderTextColor="#999" keyboardType="decimal-pad" style={styles.goalInput} />
          <Text style={styles.goalUnit}>kg</Text>
        </View>
        <View style={styles.goalCalc}>
          <Text style={styles.goalCalcText}>{goalKg || "0"} kg × 7700 =</Text>
          <Text style={styles.goalCalcResult}>{goalCal ? goalCal.toLocaleString() : "0"} kcal</Text>
        </View>
        {goalCal > 0 && (
          <View style={styles.progSection}>
            <Ring pct={pct} color={pct >= 100 ? "#6ee7b7" : "#818cf8"} track={t.surface3} textColor={t.text} subColor={t.textMute} />
            <View style={styles.progStatsCol}>
              <View style={styles.progStatBox}>
                <Text style={styles.progStatLabel}>本月已支出</Text>
                <Text style={styles.progStatValGreen}>{Math.round(monthAchieved).toLocaleString()} kcal</Text>
              </View>
              <View style={styles.progStatBox}>
                <Text style={styles.progStatLabel}>距目标还差</Text>
                <Text style={[styles.progStatValAmber, remaining <= 0 && { color: "#6ee7b7" }]}>
                  {remaining <= 0 ? "已达成 🎉" : Math.round(remaining).toLocaleString() + " kcal"}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </>
  );
}

function Macro({ val, label, color, pct }) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroVal, { color }]}>{val}g</Text>
      <Text style={styles.macroName}>{label}</Text>
      <Text style={[styles.macroPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function MacroEdit({ styles, val, label, color, pct, onChange }) {
  return (
    <View style={styles.macro}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center" }}>
        <TextInput
          value={String(val)}
          onChangeText={onChange}
          keyboardType="number-pad"
          style={[styles.macroValInput, { color }]}
        />
        <Text style={[styles.macroVal, { color, fontSize: 12 }]}>g</Text>
      </View>
      <Text style={styles.macroName}>{label}</Text>
      <Text style={[styles.macroPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function ExerciseLibrary({ styles, favExercises, addFav, removeFav, onBack }) {
  const [name, setName] = useState("");
  const [cal, setCal] = useState("");
  function submit() {
    if (!name.trim() || !cal) return;
    addFav(name.trim(), cal);
    setName(""); setCal("");
  }
  return (
    <>
      <View style={styles.recHeader}>
        <Text style={styles.title}>常用运动</Text>
        <TouchableOpacity onPress={onBack} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>‹ 返回</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.date}>登记常做的运动和消耗，记录时直接选用</Text>

      {/* 添加新常用运动 */}
      <View style={styles.libAddCard}>
        <TextInput
          value={name} onChangeText={setName}
          placeholder="运动名称，如 KPOP舞蹈" placeholderTextColor="#999"
          style={styles.libNameInput}
        />
        <View style={styles.libCalRow}>
          <TextInput
            value={cal} onChangeText={setCal}
            placeholder="消耗" placeholderTextColor="#999" keyboardType="number-pad"
            style={styles.libCalInput}
          />
          <Text style={styles.libCalUnit}>kcal</Text>
          <TouchableOpacity style={styles.libAddBtn} onPress={submit}>
            <Text style={styles.libAddBtnText}>添加</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 已有列表 */}
      {favExercises.map(fav => (
        <View key={fav.id} style={styles.libItem}>
          <Text style={styles.libItemName}>{fav.name}</Text>
          <View style={styles.todayExRight}>
            <Text style={styles.libItemCal}>−{fav.cal} kcal</Text>
            <TouchableOpacity onPress={() => removeFav(fav.id)}><Text style={styles.exDel}>×</Text></TouchableOpacity>
          </View>
        </View>
      ))}
      {favExercises.length === 0 && <Text style={styles.libEmpty}>还没有登记任何常用运动</Text>}
    </>
  );
}

function RecipeBook({ styles, t, recipes, onBack, onSave, onDelete, onAddToMeal }) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [cal, setCal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");
  const [photoUri, setPhotoUri] = useState(null);
  const [methodUri, setMethodUri] = useState(null);
  const [saving, setSaving] = useState(false);

  async function pickPhoto(setter) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("需要相册权限"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) setter(result.assets[0].uri);
  }

  async function submit() {
    if (!name.trim() || !cal || !photoUri || !methodUri) {
      Alert.alert("请填写", "菜名、卡路里、两张图片都必须填写"); return;
    }
    setSaving(true);
    await onSave(name.trim(), cal, p, c, f, photoUri, methodUri);
    setName(""); setCal(""); setP(""); setC(""); setF(""); setPhotoUri(null); setMethodUri(null);
    setSaving(false);
    setShowForm(false);
  }

  return (
    <>
      <View style={styles.recHeader}>
        <Text style={styles.title}>菜谱册</Text>
        <TouchableOpacity onPress={onBack} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>‹ 返回</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.date}>登记常做的菜，可直接添加到餐食</Text>

      {/* 展开/收起新增表单 */}
      <TouchableOpacity style={styles.recipeAddToggle} onPress={() => setShowForm(v => !v)}>
        <Text style={styles.recipeAddToggleText}>{showForm ? "▲ 收起" : "+ 新增菜谱"}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={[styles.libAddCard, { marginBottom: 16 }]}>
          <TextInput value={name} onChangeText={setName} placeholder="菜名" placeholderTextColor="#999"
            style={styles.libNameInput} />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { marginBottom: 4 }]}>卡路里 kcal</Text>
              <TextInput value={cal} onChangeText={setCal} placeholder="0" placeholderTextColor="#999"
                keyboardType="number-pad" style={[styles.libCalInput, { minWidth: 0, width: "100%" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { marginBottom: 4 }]}>蛋白质 g</Text>
              <TextInput value={p} onChangeText={setP} placeholder="0" placeholderTextColor="#999"
                keyboardType="number-pad" style={[styles.libCalInput, { minWidth: 0, width: "100%", color: "#60a5fa" }]} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { marginBottom: 4 }]}>碳水 g</Text>
              <TextInput value={c} onChangeText={setC} placeholder="0" placeholderTextColor="#999"
                keyboardType="number-pad" style={[styles.libCalInput, { minWidth: 0, width: "100%", color: "#f59e0b" }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardLabel, { marginBottom: 4 }]}>脂肪 g</Text>
              <TextInput value={f} onChangeText={setF} placeholder="0" placeholderTextColor="#999"
                keyboardType="number-pad" style={[styles.libCalInput, { minWidth: 0, width: "100%", color: "#f87171" }]} />
            </View>
          </View>
          {/* 图片选择 */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
            <TouchableOpacity style={styles.recipeImgPicker} onPress={() => pickPhoto(setPhotoUri)}>
              {photoUri
                ? <Image source={{ uri: photoUri }} style={styles.recipeImgThumb} />
                : <Text style={{ color: "#999", fontSize: 11, textAlign: "center" }}>📷{"\n"}成品图</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.recipeImgPicker} onPress={() => pickPhoto(setMethodUri)}>
              {methodUri
                ? <Image source={{ uri: methodUri }} style={styles.recipeImgThumb} />
                : <Text style={{ color: "#999", fontSize: 11, textAlign: "center" }}>📋{"\n"}做法图</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.libAddBtn} onPress={submit} disabled={saving}>
            <Text style={styles.libAddBtnText}>{saving ? "保存中…" : "登记菜谱"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {recipes.length === 0 && <Text style={styles.libEmpty}>还没有菜谱，快去登记第一道吧！</Text>}
      {recipes.map(r => (
        <RecipeCard key={r.id} recipe={r} styles={styles} t={t} onDelete={onDelete} onAddToMeal={onAddToMeal} />
      ))}
    </>
  );
}

function RecipeCard({ recipe, styles, t, onDelete, onAddToMeal }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  function toggleFlip() {
    Animated.spring(flip, {
      toValue: flipped ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
    setFlipped(!flipped);
  }

  const frontRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backRotate = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  return (
    <View style={styles.recipeCard}>
      {/* 全宽翻转图片区 */}
      <View style={styles.recipeCardImgWrap}>
        <Animated.View style={[styles.recipeCardImgFace, { transform: [{ rotateY: frontRotate }] }]}>
          <TouchableOpacity onPress={toggleFlip} activeOpacity={0.9} style={{ width: "100%" }}>
            {recipe.photoUri
              ? <Image source={{ uri: recipe.photoUri }} style={styles.recipeCardImg} />
              : <View style={[styles.recipeCardImg, { backgroundColor: t.surface3, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: t.textMute }}>无图</Text>
                </View>}
            <View style={styles.recipeCardFlipHint}>
              <Text style={{ color: "#fff", fontSize: 12 }}>成品图 · 点击查看做法</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
        <Animated.View style={[styles.recipeCardImgFace, styles.recipeCardImgBack, { transform: [{ rotateY: backRotate }] }]}>
          <TouchableOpacity onPress={toggleFlip} activeOpacity={0.9} style={{ width: "100%" }}>
            {recipe.methodUri
              ? <Image source={{ uri: recipe.methodUri }} style={styles.recipeCardImg} />
              : <View style={[styles.recipeCardImg, { backgroundColor: t.surface3, alignItems: "center", justifyContent: "center" }]}>
                  <Text style={{ color: t.textMute }}>无图</Text>
                </View>}
            <View style={styles.recipeCardFlipHint}>
              <Text style={{ color: "#fff", fontSize: 12 }}>做法图 · 点击返回</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* 文字信息行 */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { fontSize: 15, marginBottom: 4 }]}>{recipe.name}</Text>
          <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
            <Text style={{ color: "#6ee7b7", fontSize: 13, fontWeight: "700" }}>{recipe.cal} kcal</Text>
            <Text style={{ color: "#60a5fa", fontSize: 12 }}>蛋白 {recipe.p}g</Text>
            <Text style={{ color: "#f59e0b", fontSize: 12 }}>碳水 {recipe.c}g</Text>
            <Text style={{ color: "#f87171", fontSize: 12 }}>脂肪 {recipe.f}g</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.recipeAddBtn} onPress={() => onAddToMeal(recipe)}>
          <Text style={styles.recipeAddBtnText}>+ 添加到餐</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.recipeDeleteBtn} onPress={() =>
        Alert.alert("删除菜谱", `确定删除「${recipe.name}」？`, [
          { text: "取消" },
          { text: "删除", style: "destructive", onPress: () => onDelete(recipe.id) },
        ])}>
        <Text style={{ color: "#f87171", fontSize: 11 }}>🗑 删除</Text>
      </TouchableOpacity>
    </View>
  );
}

const METRIC_OPTIONS = [
  { key: "weight", label: "体重" },
  { key: "waist", label: "腰围" },
  { key: "lowerAbdomen", label: "下腹围" },
  { key: "hip", label: "臀围" },
  { key: "chest", label: "胸围" },
  { key: "arm", label: "手臂围" },
  { key: "thigh", label: "大腿围" },
  { key: "calf", label: "小腿围" },
];

function BodyTrend({ styles, t, bodyHistory, metric, setMetric }) {
  // 取出有该指标数值的记录
  const points = bodyHistory.filter(r => r[metric] != null);

  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendTitle}>身体趋势</Text>

      {/* 指标切换 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.metricRow}>
        {METRIC_OPTIONS.map(m => (
          <TouchableOpacity key={m.key} onPress={() => setMetric(m.key)}
            style={[styles.metricChip, metric === m.key && styles.metricChipActive]}>
            <Text style={[styles.metricChipText, metric === m.key && styles.metricChipTextActive]}>{m.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {points.length < 2 ? (
        <View style={styles.trendEmpty}>
          <Text style={styles.trendEmptyText}>
            {points.length === 0 ? "还没有记录，填好数据后点「记录今日数据」" : "再记录一天就能看到趋势曲线了"}
          </Text>
        </View>
      ) : (
        <LineChart
          data={{
            labels: points.map(r => r.date.slice(5)), // MM-DD
            datasets: [{ data: points.map(r => r[metric]) }],
          }}
          width={Dimensions.get("window").width - 64}
          height={200}
          chartConfig={{
            backgroundGradientFrom: t.surface2,
            backgroundGradientTo: t.surface2,
            decimalPlaces: 1,
            color: (o = 1) => `rgba(110, 231, 183, ${o})`,
            labelColor: () => t.textMute,
            propsForDots: { r: "4", strokeWidth: "2", stroke: "#6ee7b7" },
          }}
          bezier
          style={{ marginTop: 12, borderRadius: 12 }}
        />
      )}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  scroll: { padding: 16, paddingBottom: 30 },
  title: { color: t.text, fontSize: 16, fontWeight: "600" },
  recHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  todayBtn: { backgroundColor: t.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  todayBtnText: { color: "#6ee7b7", fontSize: 11, fontWeight: "600" },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 14 },
  dateNavArrow: { color: "#6ee7b7", fontSize: 26, paddingHorizontal: 12, lineHeight: 28 },
  date: { color: t.textMute, fontSize: 12, marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: "row", backgroundColor: t.surface, borderRadius: 14, padding: 4, gap: 2, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  tabActive: { backgroundColor: t.border2 },
  tabEmoji: { fontSize: 15, marginBottom: 2 },
  tabLabel: { fontSize: 12, color: t.textMute, fontWeight: "500" },
  tabLabelActive: { color: "#fff" },
  upload: { backgroundColor: t.surface, borderRadius: 16, height: 240, borderWidth: 1.5, borderColor: t.textFaint, borderStyle: "dashed", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  uploadInner: { alignItems: "center", gap: 8 },
  uploadText: { color: t.textMute, fontSize: 13 },
  uploadHint: { color: t.textFaint, fontSize: 11 },
  previewImg: { width: "100%", height: "100%", resizeMode: "contain" },
  analyzing: { marginTop: 12, backgroundColor: t.surface, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  analyzingText: { color: "#6ee7b7", fontSize: 13 },
  card: { marginTop: 12, backgroundColor: t.surface, borderRadius: 16, padding: 16 },
  cardLabel: { color: t.textMute, fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  deleteBtn: { marginTop: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: t.dangerBg, alignItems: "center" },
  deleteBtnText: { color: "#f87171", fontSize: 12, fontWeight: "600" },
  calNumInput: { color: "#6ee7b7", fontSize: 30, fontWeight: "700", padding: 0, minWidth: 60, borderBottomWidth: 1, borderBottomColor: t.textFaint },
  macroValInput: { fontSize: 15, fontWeight: "700", padding: 0, textAlign: "center", minWidth: 28, borderBottomWidth: 1, borderBottomColor: t.textFaint },
  snackCard: { marginTop: 12, backgroundColor: t.surface, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center" },
  snackLabel: { color: t.text2, fontSize: 13, flex: 1 },
  snackInput: { color: "#fbbf24", fontSize: 16, fontWeight: "700", textAlign: "right", minWidth: 60, padding: 0 },
  snackUnit: { color: t.textMute, fontSize: 11, marginLeft: 6 },
  exEmptyBox: { backgroundColor: t.surface, borderRadius: 12, padding: 24, alignItems: "center", gap: 12 },
  exEmptyText: { color: t.textMute, fontSize: 13 },
  exEmptyBtn: { backgroundColor: "#2d5a3d", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  exEmptyBtnText: { color: "#6ee7b7", fontSize: 13, fontWeight: "600" },
  favPickWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  favPickChip: { backgroundColor: t.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: t.border2 },
  favPickName: { color: t.text, fontSize: 13 },
  favPickCal: { color: "#818cf8", fontSize: 12, fontWeight: "700" },
  todayExBox: { marginTop: 16, backgroundColor: t.surface2, borderRadius: 12, padding: 14 },
  todayExTitle: { color: t.textDim, fontSize: 11, letterSpacing: 0.5, marginBottom: 8 },
  todayExRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#222" },
  todayExName: { color: "#ddd", fontSize: 13 },
  todayExRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  todayExCal: { color: "#818cf8", fontSize: 13, fontWeight: "600" },
  libAddCard: { backgroundColor: t.surface, borderRadius: 12, padding: 14, marginBottom: 14 },
  libNameInput: { color: t.text, fontSize: 14, padding: 0, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: t.border2, paddingBottom: 8 },
  libCalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  libCalInput: { color: "#818cf8", fontSize: 16, fontWeight: "700", backgroundColor: t.surface3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minWidth: 80, textAlign: "right" },
  libCalUnit: { color: t.textMute, fontSize: 12, flex: 1 },
  libAddBtn: { backgroundColor: "#2d5a3d", borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9 },
  libAddBtnText: { color: "#6ee7b7", fontSize: 13, fontWeight: "700" },
  libItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: t.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 },
  libItemName: { color: t.text, fontSize: 14 },
  libItemCal: { color: "#818cf8", fontSize: 13, fontWeight: "600" },
  libEmpty: { color: t.textMute, fontSize: 12, textAlign: "center", marginTop: 20 },
  themeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  themeCard: { width: "47%", backgroundColor: t.surface, borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 2 },
  themeSwatch: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  themeSwatchDot: { width: 16, height: 16, borderRadius: 8 },
  themeName: { color: t.text, fontSize: 14, fontWeight: "600" },
  themeActive: { color: "#6ee7b7", fontSize: 11, marginTop: 4, fontWeight: "600" },
  summary: { color: t.text, fontSize: 13, lineHeight: 20, marginBottom: 14 },
  calRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: t.border2 },
  calNum: { color: "#6ee7b7", fontSize: 30, fontWeight: "700" },
  calUnit: { color: t.textMute, fontSize: 12 },
  macros: { flexDirection: "row", gap: 8 },
  macro: { flex: 1, backgroundColor: t.surface3, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  macroVal: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  macroName: { color: t.textMute, fontSize: 10 },
  macroPct: { fontSize: 10, marginTop: 2, opacity: 0.7 },
  daily: { marginTop: 12, backgroundColor: t.surface2, borderRadius: 14, padding: 14 },
  dailyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  dailyTitle: { color: t.textDim, fontSize: 11, letterSpacing: 0.5 },
  dailyTotal: { color: "#6ee7b7", fontSize: 13, fontWeight: "600" },
  mealRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  mealRowBorder: { borderBottomWidth: 1, borderBottomColor: "#222" },
  mealNameWrap: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  mealName: { color: t.textDim, fontSize: 12 },
  mealCal: { fontSize: 12 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#222" },
  netLabel: { color: t.textMute, fontSize: 11 },
  netVal: { fontSize: 13, fontWeight: "700" },
  exCard: { backgroundColor: t.surface, borderRadius: 12, padding: 12, marginBottom: 8 },
  exRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  exIdx: { width: 18, height: 18, borderRadius: 5, backgroundColor: t.surface3, alignItems: "center", justifyContent: "center" },
  exIdxText: { color: t.textMute, fontSize: 9 },
  exNameInput: { flex: 1, color: t.text, fontSize: 12, padding: 0 },
  exDurWrap: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: t.surface3, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  exDurInput: { color: t.text2, fontSize: 12, minWidth: 28, textAlign: "right", padding: 0 },
  exDurUnit: { color: t.textFaint, fontSize: 10 },
  exDel: { color: t.textMute, fontSize: 18, paddingHorizontal: 2 },
  exResult: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.border },
  exResultLabel: { color: t.textFaint, fontSize: 11 },
  exResultVal: { fontSize: 13, fontWeight: "700" },
  addBtn: { borderWidth: 1.5, borderColor: t.border2, borderStyle: "dashed", borderRadius: 12, padding: 12, alignItems: "center", marginTop: 2 },
  addBtnText: { color: t.textMute, fontSize: 13 },
  exTotal: { marginTop: 12, backgroundColor: t.surface2, borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  exTotalLabel: { color: t.textDim, fontSize: 12 },
  exTotalVal: { color: "#818cf8", fontSize: 16, fontWeight: "700" },
  calWeek: { flexDirection: "row", marginBottom: 6 },
  calWeekText: { flex: 1, textAlign: "center", color: t.textMute, fontSize: 12 },
  calGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  calCell: { width: `${100/7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calCellToday: { backgroundColor: t.surface, borderRadius: 10 },
  calDay: { fontSize: 16, textAlign: "center", fontWeight: "500" },
  calVal: { fontSize: 10, textAlign: "center", marginTop: 2 },
  goalCard: { backgroundColor: t.surface2, borderRadius: 14, padding: 16, marginTop: 12 },
  goalLabel: { color: t.textDim, fontSize: 12, marginBottom: 10 },
  goalInputRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 14 },
  goalInput: { color: "#6ee7b7", fontSize: 32, fontWeight: "700", minWidth: 80, borderBottomWidth: 1, borderBottomColor: t.textFaint, padding: 0 },
  goalUnit: { color: t.textMute, fontSize: 14 },
  goalCalc: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: t.surface3, borderRadius: 10, padding: 12 },
  goalCalcText: { color: t.textDim, fontSize: 12 },
  goalCalcResult: { color: "#f59e0b", fontSize: 15, fontWeight: "700" },
  progSection: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 18 },
  progStatsCol: { flex: 1, gap: 10 },
  progStatBox: { backgroundColor: t.surface3, borderRadius: 10, padding: 12 },
  progStatLabel: { color: t.textMute, fontSize: 11, marginBottom: 3 },
  progStatValGreen: { color: "#6ee7b7", fontSize: 16, fontWeight: "700" },
  progStatValAmber: { color: "#f59e0b", fontSize: 16, fontWeight: "700" },
  profileRow: { flexDirection: "row", alignItems: "center", backgroundColor: t.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  profileLabel: { color: t.text2, fontSize: 13, flex: 1 },
  profileInput: { color: "#6ee7b7", fontSize: 14, fontWeight: "600", textAlign: "right", minWidth: 60 },
  profileUnit: { color: t.textMute, fontSize: 11, marginLeft: 6, width: 30 },
  recordBodyBtn: { marginTop: 12, backgroundColor: "#2d5a3d", borderRadius: 12, padding: 14, alignItems: "center" },
  recordBodyBtnText: { color: "#6ee7b7", fontSize: 14, fontWeight: "700" },
  trendCard: { marginTop: 16, backgroundColor: t.surface2, borderRadius: 14, padding: 14 },
  trendTitle: { color: t.text, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  metricRow: { flexDirection: "row" },
  metricChip: { backgroundColor: t.surface3, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  metricChipActive: { backgroundColor: "#2d5a3d" },
  metricChipText: { color: t.textDim, fontSize: 12 },
  metricChipTextActive: { color: "#6ee7b7", fontWeight: "600" },
  trendEmpty: { paddingVertical: 30, alignItems: "center" },
  trendEmptyText: { color: t.textMute, fontSize: 12, textAlign: "center" },
  nav: { flexDirection: "row", backgroundColor: t.navBg, borderTopWidth: 1, borderTopColor: t.navBorder, paddingTop: 8, paddingBottom: 8 },
  navItem: { flex: 1, alignItems: "center" },
  navIcon: { fontSize: 20, marginBottom: 2 },
  navLabel: { fontSize: 10 },
  // recipe book
  recipeImgPicker: { width: 120, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: t.textFaint, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  recipeImgThumb: { width: "100%", height: "100%", resizeMode: "cover" },
  recipeCard: { backgroundColor: t.surface, borderRadius: 14, padding: 14, marginBottom: 14 },
  recipeCardImgWrap: { width: "100%", height: RECIPE_IMG_H, position: "relative" },
  recipeCardImgFace: { position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden" },
  recipeCardImgBack: { backfaceVisibility: "hidden" },
  recipeCardImg: { width: "100%", height: RECIPE_IMG_H, borderRadius: 10, resizeMode: "cover" },
  recipeCardFlipHint: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.45)", borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingVertical: 6, alignItems: "center" },
  recipeAddToggle: { backgroundColor: "#2d5a3d", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignSelf: "flex-start", marginBottom: 12 },
  recipeAddToggleText: { color: "#6ee7b7", fontSize: 13, fontWeight: "700" },
  recipeAddBtn: { backgroundColor: "#2d5a3d", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  recipeAddBtnText: { color: "#6ee7b7", fontSize: 12, fontWeight: "600" },
  recipeDeleteBtn: { marginTop: 10, alignItems: "flex-end" },
  // meal pick modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  mealPickSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  mealPickTitle: { fontSize: 15, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  mealPickRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 1 },
  mealPickLabel: { fontSize: 15 },
  mealPickCancel: { marginTop: 14, alignItems: "center", paddingVertical: 12, backgroundColor: t.surface3, borderRadius: 12 },
});