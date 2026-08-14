import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Supabase 项目连接配置
const SUPABASE_URL = "https://ppagxkmciggmosxjbkgu.supabase.co";
const SUPABASE_KEY = "sb_publishable_-qA71Mwvvw_ODjfjAMPhWQ_s9gk7l59";

// 创建一个可复用的 supabase 客户端，App 里各处都从这里 import
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,      // 用手机本地存储保存登录状态（为以后登录做准备）
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,  // React Native 不是浏览器，关掉这个
  },
});
