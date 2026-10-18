// 应用图标生成脚本：用 Electron 画一个 1024x1024 的图标，保存为 build/icon.png
// 运行方式：env -u ELECTRON_RUN_AS_NODE npx electron scripts/generate-icon.cjs
// 说明：直接读取画布像素导出，不受窗口缩放影响；图案：深蓝圆角底 + 金色账本 + 封面 ¥
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
      // 1. 圆角深蓝渐变底（与软件界面配色统一）
      ctx.beginPath()
      ctx.roundRect(0, 0, 1024, 1024, 190)
      const g = ctx.createLinearGradient(0, 0, 0, 1024)
      g.addColorStop(0, '#2f4d75')
      g.addColorStop(1, '#1c3354')
      ctx.fillStyle = g
      ctx.fill()
      // 2. 金色账本（打开的书）：底部垫一层浅金色书页，上面左右两页
      ctx.beginPath()
      ctx.roundRect(214, 244, 596, 520, 28)
      ctx.fillStyle = '#f2b93b'
      ctx.fill()
      // 左页（越靠中缝越深，带一点翻页的立体感）
      const gl = ctx.createLinearGradient(232, 0, 512, 0)
      gl.addColorStop(0, '#f2a83a')
      gl.addColorStop(1, '#eda100')
      ctx.beginPath()
      ctx.roundRect(232, 262, 280, 500, 22)
      ctx.fillStyle = gl
      ctx.fill()
      // 右页
      const gr = ctx.createLinearGradient(512, 0, 792, 0)
      gr.addColorStop(0, '#eda100')
      gr.addColorStop(1, '#f2a83a')
      ctx.beginPath()
      ctx.roundRect(512, 262, 280, 500, 22)
      ctx.fillStyle = gr
      ctx.fill()
      // 中缝阴影，让左右两页分开
      ctx.fillStyle = 'rgba(28, 51, 84, 0.35)'
      ctx.fillRect(505, 268, 14, 488)
      // 页面边缘描边，增强轮廓
      ctx.strokeStyle = 'rgba(28, 51, 84, 0.2)'
      ctx.lineWidth = 6
      ctx.beginPath()
      ctx.roundRect(232, 262, 280, 500, 22)
      ctx.roundRect(512, 262, 280, 500, 22)
      ctx.stroke()
      // 3. 封面中央深蓝色 ¥，点出"记账"主题
      ctx.font = 'bold 300px "Microsoft YaHei", "PingFang SC", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#1c3354'
      ctx.fillText('¥', 512, 545)
      window.__dataUrl = document.getElementById('c').toDataURL('image/png')
      window.__done = true
    </script></body></html>`

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((resolve) => setTimeout(resolve, 800))
  const result = await win.webContents.executeJavaScript('({ dataUrl: window.__dataUrl })')
  const base64 = result.dataUrl.replace(/^data:image\/png;base64,/, '')
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'build', 'icon.png'), Buffer.from(base64, 'base64'))
  console.log('✅ 图标已生成：build/icon.png（深蓝底 + 金色账本 + 封面 ¥）')
  app.quit()
})
