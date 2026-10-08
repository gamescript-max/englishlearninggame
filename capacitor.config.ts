import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.littlefox.englishisland",
  appName: "萌宠英语探索岛",
  webDir: "mobile-dist",
  backgroundColor: "#f6faf7",
  loggingBehavior: "debug",
  android: {
    backgroundColor: "#f6faf7",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    minWebViewVersion: 111,
  },
  server: {
    hostname: "localhost",
    androidScheme: "https",
    errorPath: "compatibility.html",
  },
};

export default config;
