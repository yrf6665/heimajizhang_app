<template>
  <div class="snake-page">
    <div class="game-header">
      <h2>🐍 贪吃蛇</h2>
      <div class="stats">
        <el-tag type="success">得分：{{ score }}</el-tag>
        <el-tag type="warning">最高分：{{ highScore }}</el-tag>
        <el-tag type="info">速度等级：{{ level }}</el-tag>
      </div>
    </div>

    <div class="canvas-wrap">
      <canvas ref="canvasRef"></canvas>
      <!-- 状态浮层：开始提示 / 已暂停 / 游戏结束 -->
      <div v-if="overlayShow" class="overlay">
        <p class="overlay-title">{{ overlayTitle }}</p>
        <p v-if="status === 'over'" class="overlay-score">
          本局得分 {{ score }}<span v-if="newRecord" class="new-record"> 🎉 新纪录！</span>
        </p>
        <el-button v-if="status === 'over'" type="primary" @click="start">再来一局</el-button>
      </div>
    </div>

    <div class="controls">
      <!-- 方向按钮：用鼠标点也能玩 -->
      <div class="dpad">
        <el-button class="dpad-btn" @click="turn('up')"><el-icon><Top /></el-icon></el-button>
        <div class="dpad-row">
          <el-button class="dpad-btn" @click="turn('left')"><el-icon><Back /></el-icon></el-button>
          <el-button class="dpad-btn" @click="turn('down')"><el-icon><Bottom /></el-icon></el-button>
          <el-button class="dpad-btn" @click="turn('right')"><el-icon><Right /></el-icon></el-button>
        </div>
      </div>

      <div class="actions">
        <el-button v-if="status === 'idle' || status === 'over'" type="primary" @click="start">
          {{ status === 'over' ? '重新开始' : '开始游戏' }}
        </el-button>
        <el-button v-if="status === 'running' || status === 'paused'" @click="togglePause">
          {{ status === 'paused' ? '继续' : '暂停' }}
        </el-button>
        <p class="tips">键盘方向键 ↑↓←→（或 WASD）控制；也可以用鼠标点左边的方向按钮。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 贪吃蛇小游戏：画布（Canvas）绘制，经典规则
// 撞墙或撞到自己身体游戏结束；吃食物得 1 分并变长，每吃 5 个提速一档
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Top, Bottom, Back, Right } from '@element-plus/icons-vue'

// 棋盘 20×20 格，画布 480×480 像素，每格 24 像素
const GRID = 20
const SIZE = 480
const CELL = SIZE / GRID
// 速度：初始每 200 毫秒走一格；每吃 5 个食物提速 20 毫秒；最快 70 毫秒
const BASE_SPEED = 200
const MIN_SPEED = 70
const SPEED_STEP = 20

type Dir = 'up' | 'down' | 'left' | 'right'
interface Point {
  x: number
  y: number
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null

const status = ref<'idle' | 'running' | 'paused' | 'over'>('idle')
const score = ref(0)
const highScore = ref(0)
const newRecord = ref(false)
const level = computed(() => Math.floor(score.value / 5) + 1)

let snake: Point[] = []
let dir: Dir = 'right'
let dirQueue: Dir[] = []
let food: Point = { x: 0, y: 0 }
let timer: ReturnType<typeof setInterval> | null = null

const overlayShow = computed(() => status.value !== 'running')
const overlayTitle = computed(() =>
  status.value === 'over' ? '游戏结束' : status.value === 'paused' ? '已暂停' : '按「开始游戏」开始'
)

/** 两个方向是否正好相反（180 度掉头） */
function opposite(a: Dir, b: Dir): boolean {
  return (
    (a === 'up' && b === 'down') ||
    (a === 'down' && b === 'up') ||
    (a === 'left' && b === 'right') ||
    (a === 'right' && b === 'left')
  )
}

/** 当前等级的速度（毫秒/格） */
function currentSpeed(): number {
  return Math.max(MIN_SPEED, BASE_SPEED - (level.value - 1) * SPEED_STEP)
}

/** 开始 / 重新开始：蛇回到棋盘中央，向右出发 */
function start(): void {
  const mid = Math.floor(GRID / 2)
  snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid }
  ]
  dir = 'right'
  dirQueue = []
  score.value = 0
  newRecord.value = false
  status.value = 'running'
  spawnFood()
  restartTimer()
  draw()
}

function togglePause(): void {
  if (status.value === 'running') {
    status.value = 'paused'
    stopTimer()
  } else if (status.value === 'paused') {
    status.value = 'running'
    restartTimer()
  }
}

/** 转向：不能 180 度掉头；用两步小队列防止快速连按导致"回头" */
function turn(d: Dir): void {
  if (status.value !== 'running') return
  const last = dirQueue.length > 0 ? dirQueue[dirQueue.length - 1] : dir
  if (opposite(last, d)) return
  // 队列已满时直接忽略新按键：挤掉旧按键会让"掉头保护"失效，蛇会掉头撞死自己
  if (dirQueue.length < 2) dirQueue.push(d)
}

/** 每一格时间到：蛇往前走一步 */
function tick(): void {
  if (dirQueue.length > 0) dir = dirQueue.shift() as Dir
  const head = snake[0]
  const next = {
    x: head.x + (dir === 'left' ? -1 : dir === 'right' ? 1 : 0),
    y: head.y + (dir === 'up' ? -1 : dir === 'down' ? 1 : 0)
  }

  // 撞墙 → 结束
  if (next.x < 0 || next.x >= GRID || next.y < 0 || next.y >= GRID) return gameOver()

  const eats = next.x === food.x && next.y === food.y
  // 撞自己 → 结束（没吃到食物时尾巴会挪开，所以尾巴那格不算撞）
  const body = eats ? snake : snake.slice(0, -1)
  if (body.some((p) => p.x === next.x && p.y === next.y)) return gameOver()

  snake.unshift(next)
  if (eats) {
    score.value += 1
    // 分数一超过最高分就立刻保存：中途退出或关窗口也不会丢纪录
    if (score.value > highScore.value) {
      highScore.value = score.value
      newRecord.value = true
      localStorage.setItem('snake-high-score', String(score.value))
    }
    if (score.value % 5 === 0) restartTimer() // 每吃 5 个提速一档
    spawnFood()
  } else {
    snake.pop()
  }
  draw()
}

function gameOver(): void {
  status.value = 'over'
  stopTimer()
  // 最高分已在游戏过程中实时保存（见 tick），这里不用再写
  draw()
}

/** 在没被蛇占用的格子里随机挑一个放食物 */
function spawnFood(): void {
  const free: Point[] = []
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      if (!snake.some((p) => p.x === x && p.y === y)) free.push({ x, y })
    }
  }
  if (free.length === 0) return gameOver() // 整盘被蛇占满（几乎不可能发生）
  food = free[Math.floor(Math.random() * free.length)]
}

function restartTimer(): void {
  stopTimer()
  timer = setInterval(tick, currentSpeed())
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

/** 画一整帧：棋盘底色 + 网格 + 食物 + 蛇 */
function draw(): void {
  if (!ctx) return
  const c = ctx
  // 背景（与软件深蓝配色统一）
  c.fillStyle = '#1c3354'
  c.fillRect(0, 0, SIZE, SIZE)
  // 淡网格线
  c.strokeStyle = 'rgba(255, 255, 255, 0.06)'
  c.lineWidth = 1
  for (let i = 1; i < GRID; i++) {
    const p = i * CELL
    c.beginPath()
    c.moveTo(p, 0)
    c.lineTo(p, SIZE)
    c.stroke()
    c.beginPath()
    c.moveTo(0, p)
    c.lineTo(SIZE, p)
    c.stroke()
  }
  // 食物：红色圆角块
  c.fillStyle = '#f56c6c'
  c.beginPath()
  c.roundRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6, 6)
  c.fill()
  // 蛇：身体绿色，头浅绿 + 两只眼睛
  snake.forEach((p, i) => {
    c.fillStyle = i === 0 ? '#85ce61' : '#67c23a'
    c.beginPath()
    c.roundRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4, 5)
    c.fill()
    if (i === 0) drawEyes(c, p)
  })
}

/** 蛇头两只小眼睛：朝向哪边，眼睛就偏向哪边 */
function drawEyes(c: CanvasRenderingContext2D, p: Point): void {
  const cx = p.x * CELL + CELL / 2
  const cy = p.y * CELL + CELL / 2
  const off = 4 // 眼睛左右偏离中心多远
  const f = 6 // 眼睛距离头部前端多远
  const spots: Point[] =
    dir === 'right'
      ? [
          { x: cx + f, y: cy - off },
          { x: cx + f, y: cy + off }
        ]
      : dir === 'left'
        ? [
            { x: cx - f, y: cy - off },
            { x: cx - f, y: cy + off }
          ]
        : dir === 'up'
          ? [
              { x: cx - off, y: cy - f },
              { x: cx + off, y: cy - f }
            ]
          : [
              { x: cx - off, y: cy + f },
              { x: cx + off, y: cy + f }
            ]
  c.fillStyle = '#fff'
  for (const s of spots) {
    c.beginPath()
    c.arc(s.x, s.y, 2.5, 0, Math.PI * 2)
    c.fill()
  }
}

function onKeydown(e: KeyboardEvent): void {
  const map: Record<string, Dir> = {
    arrowup: 'up',
    arrowdown: 'down',
    arrowleft: 'left',
    arrowright: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right'
  }
  const d = map[e.key.toLowerCase()]
  if (!d) return
  e.preventDefault() // 防止方向键滚动页面
  turn(d)
}

onMounted(() => {
  // 按屏幕清晰度放大画布，保证高分屏上画面不发虚
  const canvas = canvasRef.value as HTMLCanvasElement
  const dpr = window.devicePixelRatio || 1
  canvas.width = SIZE * dpr
  canvas.height = SIZE * dpr
  canvas.style.width = `${SIZE}px`
  canvas.style.height = `${SIZE}px`
  ctx = canvas.getContext('2d')
  ctx?.scale(dpr, dpr)
  // 读出本机最高分（存在软件自带的小仓库里，与账本数据库无关）
  highScore.value = Number(localStorage.getItem('snake-high-score') ?? 0) || 0
  // 初始画面：待命的小蛇（居中三节）+ 一颗食物
  const mid = Math.floor(GRID / 2)
  snake = [
    { x: mid, y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid }
  ]
  food = { x: mid + 5, y: mid }
  draw()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  stopTimer()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.snake-page {
  max-width: 760px;
  margin: 0 auto;
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.game-header h2 {
  margin: 0;
  color: #303133;
  font-size: 22px;
}

.stats {
  display: flex;
  gap: 8px;
}

.canvas-wrap {
  position: relative;
  width: 480px;
  height: 480px;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(28, 51, 84, 0.25);
}

.canvas-wrap canvas {
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(20, 34, 58, 0.72);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.overlay-title {
  margin: 0;
  color: #fff;
  font-size: 30px;
  font-weight: 600;
}

.overlay-score {
  margin: 0;
  color: #dfe6f0;
  font-size: 16px;
}

.new-record {
  color: #ffd04b;
  font-weight: 600;
}

.controls {
  display: flex;
  align-items: center;
  gap: 28px;
  margin-top: 18px;
}

.dpad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.dpad-row {
  display: flex;
  gap: 4px;
}

.dpad-btn {
  width: 44px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tips {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
</style>
