// 应用图标生成脚本：用 Electron 画一个 1024x1024 的图标，保存为 build/icon.png
// 运行方式：env -u ELECTRON_RUN_AS_NODE npx electron scripts/generate-icon.cjs
// 说明：直接读取画布像素导出，不受窗口缩放影响；若系统无法渲染马表情，自动改用"马"字
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false })

  const html = `<!doctype html><html><body style="margin:0">
    <canvas id="c" width="1024" height="1024"></canvas>
    <script>
      const ctx = document.getElementById('c').getContext('2d')
      // 圆角深蓝渐变底（与软件界面配色统一）
      ctx.beginPath()
      ctx.roundRect(0, 0, 1024, 1024, 190)
      const g = ctx.createLinearGradient(0, 0, 0, 1024)
      g.addColorStop(0, '#2f4d75')
      g.addColorStop(1, '#1c3354')
      ctx.fillStyle = g
      ctx.fill()
      const before = ctx.getImageData(512, 512, 1, 1).data.join(',')
      // 先尝试马的表情符号
      ctx.font = '560px "Segoe UI Emoji", "Apple Color Emoji", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('🐴', 512, 560)
      const after = ctx.getImageData(512, 512, 1, 1).data.join(',')
      window.__usedEmoji = before !== after
      if (!window.__usedEmoji) {
        // 表情没渲染出来，改用白色"马"字（任何系统都有中文字体，绝对可靠）
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 480px "Microsoft YaHei", "PingFang SC", sans-serif'
        ctx.fillText('马', 512, 540)
      }
      // 右下角金色 ¥ 徽章，点出"记账"主题
      ctx.beginPath()
      ctx.arc(788, 788, 148, 0, Math.PI * 2)
      ctx.fillStyle = '#eda100'
      ctx.fill()
      ctx.lineWidth = 12
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.font = 'bold 168px "Microsoft YaHei", sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('¥', 788, 800)
      window.__dataUrl = document.getElementById('c').toDataURL('image/png')
      window.__done = true
    </script></body></html>`

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // 等待表情符号字体加载与渲染
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const result = await win.webContents.executeJavaScript(
    `({ dataUrl: window.__dataUrl, usedEmoji: window.__usedEmoji })`
  )
  const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, '')
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'build', 'icon.png'), Buffer.from(base64, 'base64'))
  console.log(`✅ 图标已生成：build/icon.png（主体：${result.usedEmoji ? '马表情' : '"马"字'}）`)
  app.quit()
})
