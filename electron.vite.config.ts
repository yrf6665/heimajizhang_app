// 构建工具配置文件（大白话：告诉打包工具各个部分从哪里读、输出到哪里）
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

// 修复：VS Code 会给自己启动的所有子进程注入 ELECTRON_RUN_AS_NODE=1，
// 导致从 VS Code 终端里启动的 Electron 软件无法弹出窗口。这里把它清除掉。
delete process.env.ELECTRON_RUN_AS_NODE

export default defineConfig({
  // 主进程（软件的"心脏"，管理窗口和数据库）
  main: {},
  // 预加载脚本（界面与主进程之间的"安全桥"）
  preload: {},
  // 界面部分（用户看到的画面）
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
