<template>
  <div class="stats">
    <div class="page-header">
      <h2>统计</h2>
      <div class="header-actions">
        <el-date-picker
          v-model="month"
          type="month"
          :clearable="false"
          format="YYYY年MM月"
          value-format="YYYY-MM"
          @change="loadMonth"
        />
        <el-date-picker
          v-model="year"
          type="year"
          :clearable="false"
          format="YYYY年"
          value-format="YYYY"
          @change="loadYear"
        />
      </div>
    </div>

    <!-- 汇总卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">本月总支出</div>
        <div class="stat-value hero">{{ formatMoney(monthStats.monthTotal) }}</div>
        <div v-if="monthStats.monthCount > 0" class="stat-delta" :style="{ color: delta.color }">
          {{ delta.icon }} {{ delta.text }}
        </div>
        <div v-else class="stat-delta muted">本月还没有账单</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">上月总支出</div>
        <div class="stat-value">{{ formatMoney(monthStats.prevMonthTotal) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月记账笔数</div>
        <div class="stat-value">{{ monthStats.monthCount }} 笔</div>
      </div>
    </div>

    <!-- 分类占比 -->
    <div class="chart-card">
      <div class="card-title">分类占比（{{ month }}）</div>
      <el-empty v-if="monthStats.monthCount === 0" description="这个月还没有账单" :image-size="80" />
      <div v-else class="pie-row">
        <EChart :option="pieOption" height="320px" class="pie-chart" />
        <div class="rank-list">
          <div v-for="c in monthStats.categories" :key="c.categoryId" class="rank-item">
            <span class="rank-dot" :style="{ background: categoryColor(c.categoryName) }"></span>
            <span class="rank-name">{{ c.categoryName }}</span>
            <span class="rank-bar"><span class="rank-fill" :style="{ width: c.percent + '%', background: categoryColor(c.categoryName) }"></span></span>
            <span class="rank-value">{{ formatMoney(c.total) }}</span>
            <span class="rank-percent">{{ c.percent }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 每日支出 -->
    <div class="chart-card">
      <div class="card-title">每日支出（{{ month }}）</div>
      <el-empty v-if="monthStats.monthCount === 0" description="这个月还没有账单" :image-size="80" />
      <EChart v-else :option="dailyOption" height="280px" />
    </div>

    <!-- 年度对比 -->
    <div class="chart-card">
      <div class="card-title">年度各月支出（{{ year }}年）</div>
      <EChart :option="yearOption" height="280px" />
    </div>
  </div>
</template>

<script setup lang="ts">
// 统计页：本月概览 + 分类占比 + 每日支出 + 年度对比
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import type { EChartsOption } from 'echarts'
import type { MonthStats, MonthlyStat } from '../../../shared/types'
import { centsToYuan, formatMoney } from '../utils/money'
import { currentMonth } from '../utils/date'
import { categoryColor, DELTA_COLORS, INK, OTHER_GRAY, SINGLE_SERIES_BLUE } from '../utils/statsColors'
import EChart from '../components/EChart.vue'

const month = ref(currentMonth())
const year = ref(String(dayjs().year()))
const monthStats = ref<MonthStats>({
  month: month.value,
  monthTotal: 0,
  monthCount: 0,
  prevMonthTotal: 0,
  categories: [],
  daily: []
})
const yearStats = ref<MonthlyStat[]>([])

async function loadMonth(): Promise<void> {
  monthStats.value = await window.api.getMonthStats(month.value)
}

async function loadYear(): Promise<void> {
  yearStats.value = await window.api.getYearStats(year.value)
}

// ---- 与上月对比（花钱变多=红色提醒，变少=绿色安心） ----

const delta = computed(() => {
  const { monthTotal, prevMonthTotal } = monthStats.value
  if (monthTotal === prevMonthTotal) {
    return { icon: '—', text: '和上月持平', color: INK.secondary }
  }
  const up = monthTotal > prevMonthTotal
  const diff = Math.abs(monthTotal - prevMonthTotal)
  const percent = prevMonthTotal > 0 ? Math.round((diff / prevMonthTotal) * 1000) / 10 : 0
  return {
    icon: up ? '▲' : '▼',
    text: `${up ? '比上月多花' : '比上月少花'} ${formatMoney(diff)}（${percent}%）`,
    color: up ? DELTA_COLORS.up : DELTA_COLORS.down
  }
})

/** 金额坐标轴刻度：1 万以上用"万"表示 */
function moneyTick(v: number): string {
  return v >= 10000 ? `${v / 10000}万` : String(v)
}

// ---- 分类占比环形图：最多 5 个主要分类 + "其他"（其余分类合并） ----

const pieOption = computed<EChartsOption>(() => {
  const cats = monthStats.value.categories
  const top = cats.slice(0, 5)
  const restTotal = cats.slice(5).reduce((s, c) => s + c.total, 0)
  const data = top.map((c) => ({
    name: c.categoryName,
    value: centsToYuan(c.total),
    itemStyle: { color: categoryColor(c.categoryName) }
  }))
  if (restTotal > 0) {
    data.push({ name: '其他', value: centsToYuan(restTotal), itemStyle: { color: OTHER_GRAY } })
  }
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const item = Array.isArray(p) ? p[0] : p
        return `${item.name}：¥${Number(item.value).toFixed(2)}（${item.percent ?? 0}%）`
      }
    },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: INK.secondary, fontSize: 12 }
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '42%'],
        // 2px 表面色间隙：相邻色块之间用背景色分隔，不用描边
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        label: { formatter: '{d}%', color: INK.secondary, fontSize: 12 },
        labelLine: { lineStyle: { color: INK.axis } },
        minShowLabelAngle: 3,
        data
      }
    ]
  }
})

// ---- 每日支出柱状图（单系列蓝色，不设图例，标题已说明内容） ----

const dailyOption = computed<EChartsOption>(() => {
  const days = monthStats.value.daily.map((d) => d.date.slice(5))
  const values = monthStats.value.daily.map((d) => centsToYuan(d.total))
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const item = Array.isArray(p) ? p[0] : p
        return `${month.value}-${item.name}<br/>支出：¥${Number(item.value).toFixed(2)}`
      }
    },
    grid: { left: 10, right: 10, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: days,
      axisLine: { lineStyle: { color: INK.axis } },
      axisTick: { show: false },
      axisLabel: { color: INK.muted, interval: 4 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: INK.muted, formatter: moneyTick },
      splitLine: { lineStyle: { color: INK.grid } }
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 24,
        barCategoryGap: '30%',
        // 圆角只在上端（数据端），底部贴基线为直角
        itemStyle: { color: SINGLE_SERIES_BLUE, borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
})

// ---- 年度各月支出柱状图 ----

const yearOption = computed<EChartsOption>(() => {
  const months = yearStats.value.map((m) => `${Number(m.month.slice(5))}月`)
  const values = yearStats.value.map((m) => centsToYuan(m.total))
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const item = Array.isArray(p) ? p[0] : p
        return `${item.name}<br/>支出：¥${Number(item.value).toFixed(2)}`
      }
    },
    grid: { left: 10, right: 10, top: 20, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: months,
      axisLine: { lineStyle: { color: INK.axis } },
      axisTick: { show: false },
      axisLabel: { color: INK.muted }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: INK.muted, formatter: moneyTick },
      splitLine: { lineStyle: { color: INK.grid } }
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 24,
        barCategoryGap: '30%',
        itemStyle: { color: SINGLE_SERIES_BLUE, borderRadius: [4, 4, 0, 0] }
      }
    ]
  }
})

onMounted(() => {
  loadMonth()
  loadYear()
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.stat-value.hero {
  font-size: 30px;
}

.stat-delta {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 500;
}

.stat-delta.muted {
  color: #909399;
  font-weight: 400;
}

.chart-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
}

.pie-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.pie-chart {
  flex: 1;
  min-width: 0;
}

.rank-list {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.rank-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rank-name {
  width: 64px;
  flex-shrink: 0;
  color: #303133;
}

.rank-bar {
  flex: 1;
  height: 4px;
  background: #e1e0d9;
  border-radius: 2px;
  overflow: hidden;
}

.rank-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
}

.rank-value {
  width: 84px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #303133;
}

.rank-percent {
  width: 48px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #898781;
}
</style>
