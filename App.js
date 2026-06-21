import { useState } from "react";
import {
  View, Text, Image, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, StatusBar, SafeAreaView, Alert
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

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
  const [tab, setTab] = useState(0);
  const [currentMeal, setCurrentMeal] = useState(0);
  const [meals, setMeals] = useState([null, null, null]);
  const [previews, setPreviews] = useState([null, null, null]);
  const [analyzing, setAnalyzing] = useState(false);
  const [exercises, setExercises] = useState([]);
  const [exLoading, setExLoading] = useState({});
  const [profile, setProfile] = useState({});
  const [goalKg, setGoalKg] = useState("");

  const data = meals[currentMeal];
  const preview = previews[currentMeal];
  const today = new Date();
  const dateStr = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日 · 周${WEEKDAYS[today.getDay()]}`;

  // ── 拍照分析 ──
  async function pickImage() {
    if (analyzing) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("需要相册权限", "请在设置里允许访问相册"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const newPreviews = [...previews];
    newPreviews[currentMeal] = asset.uri;
    setPreviews(newPreviews);
    setAnalyzing(true);
    try {
      const m = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      const text = await callClaude([{
        role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.base64 } },
          { type: "text", text: '请分析这张餐食图片，用中文输出 JSON，不要加任何说明文字，格式：{"summary":"食物描述30字以内","cal":数字,"p":数字,"c":数字,"f":数字}，cal是总千卡，p=蛋白质克，c=碳水克，f=脂肪克。' }
        ]
      }]);
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const newMeals = [...meals];
      newMeals[currentMeal] = parsed;
      setMeals(newMeals);
    } catch (e) {
      Alert.alert("分析失败", String(e.message || e));
    }
    setAnalyzing(false);
  }

  // ── 运动 ──
  function addExercise() {
    setExercises(prev => [...prev, { id: Date.now(), name: "", duration: "", cal: null }]);
  }
  function updateExercise(id, field, value) {
    setExercises(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }
  function removeExercise(id) {
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
      updateExercise(id, "cal", !isNaN(num) && num > 0 ? num : Math.round(parseInt(duration) * 5.5));
    } catch {
      updateExercise(id, "cal", Math.round(parseInt(duration) * 5.5));
    }
    setExLoading(prev => ({ ...prev, [id]: false }));
  }
  function exerciseBlur(id, name, duration) {
    const ex = exercises.find(e => e.id === id);
    if (ex && name.trim() && duration && !ex.cal && !exLoading[id]) calcExercise(id, name, duration);
  }

  // ── 计算 ──
  const totalCal = meals.reduce((s, m) => s + (m?.cal || 0), 0);
  const exCal = exercises.reduce((s, e) => s + (e.cal || 0), 0);
  const bmr = parseInt(profile.bmr) || 0;
  const net = (bmr && (totalCal || exCal)) ? totalCal - bmr - exCal : null;
  const goalCal = goalKg ? Math.round(parseFloat(goalKg) * 7700) : 0;

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

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ════════ 记录 ════════ */}
        {tab === 0 && (<>
          <Text style={styles.title}>今日记录</Text>
          <Text style={styles.date}>{dateStr}</Text>
          <View style={styles.tabs}>
            {MEAL_LABELS.map((m, i) => (
              <TouchableOpacity key={i} onPress={() => setCurrentMeal(i)} style={[styles.tab, currentMeal === i && styles.tabActive]}>
                <Text style={styles.tabEmoji}>{m.emoji}</Text>
                <Text style={[styles.tabLabel, currentMeal === i && styles.tabLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.upload} onPress={pickImage} activeOpacity={0.8}>
            {preview ? <Image source={{ uri: preview }} style={styles.previewImg} /> : (
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
                    editable={isReal || ex.id === "e0"}
                    onFocus={() => { if (!isReal && ex.id === "e0") addExercise(); }}
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
        {tab === 2 && (<>
          <Text style={styles.title}>本月目标</Text>
          <Text style={styles.date}>{today.getFullYear()} 年 {today.getMonth() + 1} 月</Text>
          <View style={styles.goalCard}>
            <Text style={styles.goalLabel}>本月想瘦</Text>
            <View style={styles.goalInputRow}>
              <TextInput value={goalKg} onChangeText={setGoalKg} placeholder="0.0" placeholderTextColor="#444" keyboardType="decimal-pad" style={styles.goalInput} />
              <Text style={styles.goalUnit}>kg</Text>
            </View>
            <View style={styles.goalCalc}>
              <Text style={styles.goalCalcText}>{goalKg || "0"} kg × 7700 =</Text>
              <Text style={styles.goalCalcResult}>{goalCal ? goalCal.toLocaleString() : "0"} kcal</Text>
            </View>
            {goalCal > 0 && (() => {
              const achieved = net !== null ? -net : 0;
              const pct = Math.max(0, Math.min(100, Math.round(achieved / goalCal * 100)));
              const remaining = goalCal - achieved;
              return (
                <View style={styles.progWrap}>
                  <View style={styles.progBarBg}>
                    <View style={[styles.progBarFill, { width: pct + "%" }]} />
                  </View>
                  <View style={styles.progStats}>
                    <Text style={styles.progPct}>{pct}% 完成</Text>
                    <Text style={styles.progRemain}>{remaining <= 0 ? "已达成 🎉" : `还差 ${remaining.toLocaleString()} kcal`}</Text>
                  </View>
                  <Text style={styles.progHint}>* 目前按今日净支出估算，明天接数据库后会按全月累计</Text>
                </View>
              );
            })()}
          </View>
        </>)}

        {/* ════════ 我的 ════════ */}
        {tab === 3 && (<>
          <Text style={styles.title}>个人资料</Text>
          <Text style={styles.date}>填写身体指标</Text>
          {BODY_FIELDS.map(({ key, label, unit }) => (
            <View key={key} style={styles.profileRow}>
              <Text style={styles.profileLabel}>{label}</Text>
              <TextInput
                value={profile[key] || ""}
                onChangeText={t => setProfile(p => ({ ...p, [key]: t }))}
                placeholder="—" placeholderTextColor="#444" keyboardType="decimal-pad"
                style={styles.profileInput}
              />
              <Text style={styles.profileUnit}>{unit}</Text>
            </View>
          ))}
        </>)}

      </ScrollView>

      {/* ════════ 底部导航 ════════ */}
      <View style={styles.nav}>
        {NAV.map((n, i) => (
          <TouchableOpacity key={i} style={styles.navItem} onPress={() => setTab(i)}>
            <Text style={styles.navIcon}>{n.icon}</Text>
            <Text style={[styles.navLabel, { color: tab === i ? "#6ee7b7" : "#3a3a4a" }]}>{n.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#16161e" },
  scroll: { padding: 16, paddingBottom: 30 },
  title: { color: "#e0e0e0", fontSize: 16, fontWeight: "600" },
  date: { color: "#555", fontSize: 12, marginTop: 2, marginBottom: 14 },
  tabs: { flexDirection: "row", backgroundColor: "#1e1e28", borderRadius: 14, padding: 4, gap: 2, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10 },
  tabActive: { backgroundColor: "#2a2a3a" },
  tabEmoji: { fontSize: 15, marginBottom: 2 },
  tabLabel: { fontSize: 12, color: "#666", fontWeight: "500" },
  tabLabelActive: { color: "#fff" },
  upload: { backgroundColor: "#1e1e28", borderRadius: 16, height: 180, borderWidth: 1.5, borderColor: "#333", borderStyle: "dashed", overflow: "hidden", justifyContent: "center", alignItems: "center" },
  uploadInner: { alignItems: "center", gap: 8 },
  uploadText: { color: "#555", fontSize: 13 },
  uploadHint: { color: "#3a3a4a", fontSize: 11 },
  previewImg: { width: "100%", height: "100%", resizeMode: "contain" },
  analyzing: { marginTop: 12, backgroundColor: "#1e1e28", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  analyzingText: { color: "#6ee7b7", fontSize: 13 },
  card: { marginTop: 12, backgroundColor: "#1e1e28", borderRadius: 16, padding: 16 },
  cardLabel: { color: "#555", fontSize: 10, letterSpacing: 1, marginBottom: 4 },
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
  // exercise
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
  // goal
  goalCard: { backgroundColor: "#1a1a24", borderRadius: 14, padding: 16 },
  goalLabel: { color: "#888", fontSize: 12, marginBottom: 10 },
  goalInputRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 14 },
  goalInput: { color: "#6ee7b7", fontSize: 32, fontWeight: "700", minWidth: 80, borderBottomWidth: 1, borderBottomColor: "#333", padding: 0 },
  goalUnit: { color: "#555", fontSize: 14 },
  goalCalc: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#252530", borderRadius: 10, padding: 12 },
  goalCalcText: { color: "#888", fontSize: 12 },
  goalCalcResult: { color: "#f59e0b", fontSize: 15, fontWeight: "700" },
  progWrap: { marginTop: 16 },
  progBarBg: { height: 10, backgroundColor: "#252530", borderRadius: 5, overflow: "hidden" },
  progBarFill: { height: "100%", backgroundColor: "#818cf8", borderRadius: 5 },
  progStats: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  progPct: { color: "#818cf8", fontSize: 12, fontWeight: "600" },
  progRemain: { color: "#f59e0b", fontSize: 12 },
  progHint: { color: "#3a3a4a", fontSize: 10, marginTop: 8 },
  // profile
  profileRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1e1e28", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  profileLabel: { color: "#aaa", fontSize: 13, flex: 1 },
  profileInput: { color: "#6ee7b7", fontSize: 14, fontWeight: "600", textAlign: "right", minWidth: 60 },
  profileUnit: { color: "#555", fontSize: 11, marginLeft: 6, width: 30 },
  // nav
  nav: { flexDirection: "row", backgroundColor: "#1a1a22", borderTopWidth: 1, borderTopColor: "#1e1e26", paddingTop: 8, paddingBottom: 8 },
  navItem: { flex: 1, alignItems: "center" },
  navIcon: { fontSize: 20, marginBottom: 2 },
  navLabel: { fontSize: 10 },
});