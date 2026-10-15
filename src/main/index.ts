// 主进程：软件的"心脏"——创建窗口、启动数据库、接收界面请求
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { createDatabase } from './db'
import { registerIpc } from './ipc'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    title: '黑马记账',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 开发模式下加载开发服务器地址，打包后加载本地页面文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // 固定应用内部名称为英文，保证数据文件路径在任何系统上都稳定
  app.setName('heima-jizhang')

  const db = createDatabase(join(app.getPath('userData'), 'heima-jizhang.db'))
  registerIpc(db)

  createWindow()

  app.on('activate', () => {
    // Mac 上点击程序坞图标时，如果没有任何窗口就重新开一个
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Windows/Linux 上关闭所有窗口即退出软件；Mac 上保留在程序坞
  if (process.platform !== 'darwin') app.quit()
})
