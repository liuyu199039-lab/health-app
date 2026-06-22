import { useState, useEffect } from "react";
import {
  View, Text, Image, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, StatusBar, SafeAreaView, Alert
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import * as SQLite from "expo-sqlite";
import Svg, { Circle } from "react-native-svg";
import { LineChart } from "react-native-chart-kit";
import { Dimensions } from "react-native";

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

  // 计算某月每天净支出（日历用）
  function loadMonthData(year, month) {
    const bmr = parseInt(profile.bmr) || 0;
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    const mealRows = db.getAllSync("SELECT date, SUM(cal) as total FROM meals WHERE date LIKE ? GROUP BY date", [prefix + "%"]);
    const exRows = db.getAllSync("SELECT date, SUM(cal) as total FROM exercises WHERE date LIKE ? GROUP BY date", [prefix + "%"]);
    const intake = {}; mealRows.forEach(r => { intake[r.date] = r.total; });
    const exer = {}; exRows.forEach(r => { exer[r.date] = r.total; });
    const out = {};
    Object.keys(intake).forEach(d => {
      if (bmr && intake[d]) out[d] = intake[d] - bmr - (exer[d] || 0);
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
  const totalCal = meals.reduce((s, m) => s + (m?.cal || 0), 0);
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
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ════════ 记录 ════════ */}
        {tab === 0 && (<>
          <View style={styles.recHeader}>
            <Text style={styles.title}>{isToday ? "今日记录" : "历史记录"}</Text>
            {!isToday && (
              <TouchableOpacity onPress={() => setSelDateStr(todayStr)} style={styles.todayBtn}>
                <Text style={styles.todayBtnText}>回到今天</Text>
              </TouchableOpacity>
            )}
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
            }}><Text style={[styles.dateNavArrow, { color: selDateStr >= todayStr ? "#2a2a3a" : "#6ee7b7" }]}>›</Text></TouchableOpacity>
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
                <Text style={styles.calNum}>{data.cal}</Text>
                <Text style={styles.calUnit}>千卡</Text>
              </View>
              <View style={styles.macros}>
                <Macro val={data.p} label="蛋白质" color="#60a5fa" pct={macros.pp} />
                <Macro val={data.c} label="碳水" color="#f59e0b" pct={macros.cp} />
                <Macro val={data.f} label="脂肪" color="#f87171" pct={macros.fp} />
              </View>
              <TouchableOpacity style={styles.deleteBtn} onPress={deleteMeal}>
                <Text style={styles.deleteBtnText}>🗑 删除这条记录</Text>
              </TouchableOpacity>
            </View>
          )}
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
                <Text style={[styles.mealCal, { color: meals[i] ? "#bbb" : "#3a3a4a" }]}>{meals[i] ? meals[i].cal + " kcal" : "未记录"}</Text>
              </View>
            ))}
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

        {/* ════════ 运动 ════════ */}
        {tab === 1 && (<>
          <Text style={styles.title}>运动记录</Text>
          <Text style={styles.date}>输入运动名称和时长后自动计算消耗</Text>
          {displayEx.map((ex, idx) => {
            const isReal = !!exercises.find(e => e.id === ex.id);
            return (
              <View key={ex.id} style={styles.exCard}>
                <View style={styles.exRow}>
                  <View style={styles.exIdx}><Text style={styles.exIdxText}>{idx + 1}</Text></View>
                  <TextInput
                    value={ex.name}
                    onChangeText={t => isReal && updateExercise(ex.id, "name", t)}
                    onBlur={() => isReal && exerciseBlur(ex.id, ex.name, ex.duration)}
                    placeholder="运动名称" placeholderTextColor="#444"
                    style={styles.exNameInput}
                    onFocus={() => { if (!isReal) addExercise(); }}
                  />
                  <View style={styles.exDurWrap}>
                    <TextInput
                      value={ex.duration}
                      onChangeText={t => isReal && updateExercise(ex.id, "duration", t)}
                      onBlur={() => isReal && exerciseBlur(ex.id, ex.name, ex.duration)}
                      placeholder="0" placeholderTextColor="#444" keyboardType="number-pad"
                      style={styles.exDurInput} editable={isReal}
                    />
                    <Text style={styles.exDurUnit}>分钟</Text>
                  </View>
                  {isReal && <TouchableOpacity onPress={() => removeExercise(ex.id)}><Text style={styles.exDel}>×</Text></TouchableOpacity>}
                </View>
                <View style={styles.exResult}>
                  <Text style={styles.exResultLabel}>消耗热量</Text>
                  {exLoading[ex.id] ? <ActivityIndicator color="#818cf8" size="small" /> :
                    <Text style={[styles.exResultVal, { color: ex.cal ? "#818cf8" : "#333" }]}>{ex.cal ? `−${ex.cal} kcal` : "—"}</Text>}
                </View>
              </View>
            );
          })}
          <TouchableOpacity style={styles.addBtn} onPress={addExercise}>
            <Text style={styles.addBtnText}>+ 添加运动</Text>
          </TouchableOpacity>
          {exCal > 0 && (
            <View style={styles.exTotal}>
              <Text style={styles.exTotalLabel}>今日运动消耗</Text>
              <Text style={styles.exTotalVal}>−{exCal} kcal</Text>
            </View>
          )}
        </>)}

        {/* ════════ 日历 ════════ */}
        {tab === 2 && (
          <CalendarPage allMonthData={allMonthData} bmr={bmr} goalKg={goalKg} saveGoal={saveGoal} goalCal={goalCal} net={net}
            todayStr={todayStr}
            onPickDay={(dStr) => { setSelDateStr(dStr); setTab(0); }} />
        )}

        {/* ════════ 我的 ════════ */}
        {tab === 3 && (<>
          <Text style={styles.title}>个人资料</Text>
          <Text style={styles.date}>填写身体指标（自动保存当前值）</Text>
          {BODY_FIELDS.map(({ key, label, unit }) => (
            <View key={key} style={styles.profileRow}>
              <Text style={styles.profileLabel}>{label}</Text>
              <TextInput
                value={profile[key] || ""}
                onChangeText={t => saveProfile(key, t)}
                placeholder="—" placeholderTextColor="#444" keyboardType="decimal-pad"
                style={styles.profileInput}
              />
              <Text style={styles.profileUnit}>{unit}</Text>
            </View>
          ))}

          <TouchableOpacity style={styles.recordBodyBtn} onPress={saveBodyToday}>
            <Text style={styles.recordBodyBtnText}>📌 记录今日数据</Text>
          </TouchableOpacity>

          <BodyTrend bodyHistory={bodyHistory} metric={chartMetric} setMetric={setChartMetric} />
        </>)}

      </ScrollView>

      <View style={styles.nav}>
        {NAV.map((n, i) => (
          <TouchableOpacity key={i} style={styles.navItem} onPress={() => i === 2 ? goToCalendar() : setTab(i)}>
            <Text style={styles.navIcon}>{n.icon}</Text>
            <Text style={[styles.navLabel, { color: tab === i ? "#6ee7b7" : "#3a3a4a" }]}>{n.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

function Ring({ pct, size = 120, stroke = 10, color = "#818cf8" }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(Math.max(pct, 0), 100) / 100 * circ;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#252530" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} />
      </Svg>
      <Text style={{ color: "#fff", fontSize: 26, fontWeight: "700" }}>{pct}%</Text>
      <Text style={{ color: "#555", fontSize: 11, marginTop: 2 }}>已完成</Text>
    </View>
  );
}

function CalendarPage({ allMonthData, bmr, goalKg, saveGoal, goalCal, net, onPickDay, todayStr }) {
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
          <TextInput value={goalKg} onChangeText={saveGoal} placeholder="0.0" placeholderTextColor="#444" keyboardType="decimal-pad" style={styles.goalInput} />
          <Text style={styles.goalUnit}>kg</Text>
        </View>
        <View style={styles.goalCalc}>
          <Text style={styles.goalCalcText}>{goalKg || "0"} kg × 7700 =</Text>
          <Text style={styles.goalCalcResult}>{goalCal ? goalCal.toLocaleString() : "0"} kcal</Text>
        </View>
        {goalCal > 0 && (
          <View style={styles.progSection}>
            <Ring pct={pct} color={pct >= 100 ? "#6ee7b7" : "#818cf8"} />
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

function BodyTrend({ bodyHistory, metric, setMetric }) {
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
            backgroundGradientFrom: "#1a1a24",
            backgroundGradientTo: "#1a1a24",
            decimalPlaces: 1,
            color: (o = 1) => `rgba(110, 231, 183, ${o})`,
            labelColor: () => "#666",
            propsForDots: { r: "4", strokeWidth: "2", stroke: "#6ee7b7" },
          }}
          bezier
          style={{ marginTop: 12, borderRadius: 12 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#16161e" },
  scroll: { padding: 16, paddingBottom: 30 },
  title: { color: "#e0e0e0", fontSize: 16, fontWeight: "600" },
  recHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  todayBtn: { backgroundColor: "#1e1e28", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  todayBtnText: { color: "#6ee7b7", fontSize: 11, fontWeight: "600" },
  dateNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 14 },
  dateNavArrow: { color: "#6ee7b7", fontSize: 26, paddingHorizontal: 12, lineHeight: 28 },
  date: { color: "#555", fontSize: 12, marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: "row", backgroundColor: "#1e1e28", borderRadius: 14, padding: 4, gap: 2, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  tabActive: { backgroundColor: "#2a2a3a" },
  tabEmoji: { fontSize: 15, marginBottom: 2 },
  tabLabel: { fontSize: 12, color: "#666", fontWeight: "500" },
  tabLabelActive: { color: "#fff" },
  upload: { backgroundColor: "#1e1e28", borderRadius: 16, height: 240, borderWidth: 1.5, borderColor: "#333", borderStyle: "dashed", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  uploadInner: { alignItems: "center", gap: 8 },
  uploadText: { color: "#555", fontSize: 13 },
  uploadHint: { color: "#3a3a4a", fontSize: 11 },
  previewImg: { width: "100%", height: "100%", resizeMode: "contain" },
  analyzing: { marginTop: 12, backgroundColor: "#1e1e28", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  analyzingText: { color: "#6ee7b7", fontSize: 13 },
  card: { marginTop: 12, backgroundColor: "#1e1e28", borderRadius: 16, padding: 16 },
  cardLabel: { color: "#555", fontSize: 10, letterSpacing: 1, marginBottom: 4 },
  deleteBtn: { marginTop: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: "#2a1f24", alignItems: "center" },
  deleteBtnText: { color: "#f87171", fontSize: 12, fontWeight: "600" },
  summary: { color: "#e0e0e0", fontSize: 13, lineHeight: 20, marginBottom: 14 },
  calRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#2a2a3a" },
  calNum: { color: "#6ee7b7", fontSize: 30, fontWeight: "700" },
  calUnit: { color: "#555", fontSize: 12 },
  macros: { flexDirection: "row", gap: 8 },
  macro: { flex: 1, backgroundColor: "#252530", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  macroVal: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  macroName: { color: "#666", fontSize: 10 },
  macroPct: { fontSize: 10, marginTop: 2, opacity: 0.7 },
  daily: { marginTop: 12, backgroundColor: "#1a1a24", borderRadius: 14, padding: 14 },
  dailyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  dailyTitle: { color: "#888", fontSize: 11, letterSpacing: 0.5 },
  dailyTotal: { color: "#6ee7b7", fontSize: 13, fontWeight: "600" },
  mealRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  mealRowBorder: { borderBottomWidth: 1, borderBottomColor: "#222" },
  mealNameWrap: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  mealName: { color: "#777", fontSize: 12 },
  mealCal: { fontSize: 12 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#222" },
  netLabel: { color: "#555", fontSize: 11 },
  netVal: { fontSize: 13, fontWeight: "700" },
  exCard: { backgroundColor: "#1e1e28", borderRadius: 12, padding: 12, marginBottom: 8 },
  exRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  exIdx: { width: 18, height: 18, borderRadius: 5, backgroundColor: "#252530", alignItems: "center", justifyContent: "center" },
  exIdxText: { color: "#555", fontSize: 9 },
  exNameInput: { flex: 1, color: "#e0e0e0", fontSize: 12, padding: 0 },
  exDurWrap: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#252530", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  exDurInput: { color: "#aaa", fontSize: 12, minWidth: 28, textAlign: "right", padding: 0 },
  exDurUnit: { color: "#444", fontSize: 10 },
  exDel: { color: "#555", fontSize: 18, paddingHorizontal: 2 },
  exResult: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#252535" },
  exResultLabel: { color: "#444", fontSize: 11 },
  exResultVal: { fontSize: 13, fontWeight: "700" },
  addBtn: { borderWidth: 1.5, borderColor: "#2a2a3a", borderStyle: "dashed", borderRadius: 12, padding: 12, alignItems: "center", marginTop: 2 },
  addBtnText: { color: "#555", fontSize: 13 },
  exTotal: { marginTop: 12, backgroundColor: "#1a1a24", borderRadius: 12, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  exTotalLabel: { color: "#888", fontSize: 12 },
  exTotalVal: { color: "#818cf8", fontSize: 16, fontWeight: "700" },
  calWeek: { flexDirection: "row", marginBottom: 6 },
  calWeekText: { flex: 1, textAlign: "center", color: "#555", fontSize: 12 },
  calGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  calCell: { width: `${100/7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  calCellToday: { backgroundColor: "#1e1e28", borderRadius: 10 },
  calDay: { fontSize: 16, textAlign: "center", fontWeight: "500" },
  calVal: { fontSize: 10, textAlign: "center", marginTop: 2 },
  goalCard: { backgroundColor: "#1a1a24", borderRadius: 14, padding: 16, marginTop: 12 },
  goalLabel: { color: "#888", fontSize: 12, marginBottom: 10 },
  goalInputRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 14 },
  goalInput: { color: "#6ee7b7", fontSize: 32, fontWeight: "700", minWidth: 80, borderBottomWidth: 1, borderBottomColor: "#333", padding: 0 },
  goalUnit: { color: "#555", fontSize: 14 },
  goalCalc: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#252530", borderRadius: 10, padding: 12 },
  goalCalcText: { color: "#888", fontSize: 12 },
  goalCalcResult: { color: "#f59e0b", fontSize: 15, fontWeight: "700" },
  progSection: { marginTop: 18, flexDirection: "row", alignItems: "center", gap: 18 },
  progStatsCol: { flex: 1, gap: 10 },
  progStatBox: { backgroundColor: "#252530", borderRadius: 10, padding: 12 },
  progStatLabel: { color: "#666", fontSize: 11, marginBottom: 3 },
  progStatValGreen: { color: "#6ee7b7", fontSize: 16, fontWeight: "700" },
  progStatValAmber: { color: "#f59e0b", fontSize: 16, fontWeight: "700" },
  profileRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1e28", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  profileLabel: { color: "#aaa", fontSize: 13, flex: 1 },
  profileInput: { color: "#6ee7b7", fontSize: 14, fontWeight: "600", textAlign: "right", minWidth: 60 },
  profileUnit: { color: "#555", fontSize: 11, marginLeft: 6, width: 30 },
  recordBodyBtn: { marginTop: 12, backgroundColor: "#2d5a3d", borderRadius: 12, padding: 14, alignItems: "center" },
  recordBodyBtnText: { color: "#6ee7b7", fontSize: 14, fontWeight: "700" },
  trendCard: { marginTop: 16, backgroundColor: "#1a1a24", borderRadius: 14, padding: 14 },
  trendTitle: { color: "#e0e0e0", fontSize: 14, fontWeight: "600", marginBottom: 10 },
  metricRow: { flexDirection: "row" },
  metricChip: { backgroundColor: "#252530", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  metricChipActive: { backgroundColor: "#2d5a3d" },
  metricChipText: { color: "#888", fontSize: 12 },
  metricChipTextActive: { color: "#6ee7b7", fontWeight: "600" },
  trendEmpty: { paddingVertical: 30, alignItems: "center" },
  trendEmptyText: { color: "#555", fontSize: 12, textAlign: "center" },
  nav: { flexDirection: "row", backgroundColor: "#1a1a22", borderTopWidth: 1, borderTopColor: "#1e1e26", paddingTop: 8, paddingBottom: 8 },
  navItem: { flex: 1, alignItems: "center" },
  navIcon: { fontSize: 20, marginBottom: 2 },
  navLabel: { fontSize: 10 },
});