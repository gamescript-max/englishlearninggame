# 安卓平板家庭安装说明

本包仅供家庭自用，通过本机文件安装，不提交 Google Play 或其它应用商店。安装包使用家庭调试签名；图片、课程和固定声音随包提供，学习数据保存在这台平板。

## 安装与迁移

1. 在原网页的家长页导出 JSON 学习备份，再将备份和 `artifacts/english-island-family.apk` 复制到平板。
2. 在平板文件管理器点开 APK。系统提示时，仅为当前文件管理器允许“安装未知应用”，完成后可关闭此权限。
3. 打开“萌宠英语探索岛”。首次由家长调整声音；跟读时按需允许麦克风，拒绝也能继续学习。
4. 到家长页导入先前 JSON，校验通过并确认后恢复进度。网页与 APK 是不同的本地存储空间，不会自动同步。
5. 在 APK 内导出备份时会打开安卓保存/分享面板，选择文件管理器保存 JSON。录音仅用于当前练习回放，不上传，也不写入备份。

请在卸载、清除应用数据或换平板前导出备份。系统自动备份已关闭；手动导出的 JSON 请自行保留。升级 APK 时保持应用 ID 和相同签名，通常可直接覆盖安装并保留进度，不需要卸载。

## 设备与离线

- 最低安卓版本为 Android 7（API 24），编译/目标版本为 API 36。平板需要 Android System WebView 111 或更高版本；旧系统也可能使用 Chrome 提供 WebView。应用对旧版组件显示中文更新说明，不会将局部错乱的页面当作兼容。
- 页面支持横竖屏与触控，允许系统改变窗口大小；安全区域边距用于避让状态栏和手势条。
- APK 不依赖私有网站登录。打包时已包含的课程、图片和固定音频可离线使用；网站后续更新不会自动进入已安装 APK，需要安装新的包。
- 麦克风为可选功能，支持与回放格式仍受设备 WebView 影响。跟读无自动评分，完成次数不代表英语级别认证。
- 编译和资源校验不等于真实平板验收。实机需检查安装、横竖屏、声音重听、跟读允许/拒绝、回放、返回键、后台暂停、断网及导入/导出。

## 源码重建

项目使用独立 Vite React 静态入口，复用网站游戏组件，不将 Vinext 服务端文件装入 APK。

```powershell
# 仅对这个 PowerShell 进程设置工具路径；按本机 JDK 实际位置调整。
$env:JAVA_HOME = 'D:\project\englishlearning\english-island\.android-tools\jdk-21.0.12.1+1'
$env:ANDROID_HOME = 'D:\Android\Sdk'
$env:PATH = $env:JAVA_HOME + '\bin;' + $env:PATH

node scripts/build-mobile.mjs --target mobile
node node_modules/@capacitor/cli/bin/capacitor sync android
Push-Location android
.\gradlew.bat assembleDebug --console=plain
Pop-Location
Copy-Item -LiteralPath android/app/build/outputs/apk/debug/app-debug.apk -Destination artifacts/english-island-family.apk
Get-FileHash -LiteralPath artifacts/english-island-family.apk -Algorithm SHA256
```

依赖已锁定在 `package-lock.json`。重建前先安装锁定依赖。工具链为 Capacitor 8、JDK 21、Android SDK 36、AGP 8.13.0、Gradle 8.14.3。首次 Gradle 构建需要下载依赖；依赖缓存完整后可另行尝试离线构建。无需全局更换 Java 或重新安装 Android Studio。

`node scripts/build-mobile.mjs --target offline` 另建网站的 `/offline/` 静态入口；它与 Android 包共用组件，网站图片和音频由独立 Service Worker 策略缓存，不能把 APK 的离线能力直接当作网页已完成缓存。

调试签名由 Android 构建工具在本机生成。签名私钥、SDK、本机构建输出不提交源码。再次打包应保留原调试密钥；正式长期分发可以改为使用自行保管的发行签名，再构建 release APK。

官方参考：[Capacitor 安卓要求](https://capacitorjs.com/docs/android)、[Capacitor 8 工具链](https://capacitorjs.com/docs/updating/8-0)、[Android 命令行构建与签名](https://developer.android.com/build/building-cmdline)。
