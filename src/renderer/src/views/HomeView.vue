<template>
  <div class="home">
    <div class="page-header">
      <h2>首页</h2>
      <el-button type="primary" @click="dialogVisible = true">
        <el-icon><Plus /></el-icon>&nbsp;记一笔
      </el-button>
    </div>

    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">本月总支出</div>
        <div class="stat-value">{{ formatMoney(stats.monthTotal) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月记账笔数</div>
        <div class="stat-value">{{ stats.monthCount }} 笔</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日支出</div>
        <div class="stat-value">{{ formatMoney(stats.todayTotal) }}</div>
      </div>
    </div>

    <!-- 本月预算卡片 -->
    <div class="budget-card">
      <div class="budget-header">
        <span class="card-title">本月预算</span>
        <el-button link type="primary" @click="budgetVisible = true">设置预算</el-button>
      </div>
      <div v-if="totalBudget" class="budget-total">
        <div class="budget-line">
          <span>已用 {{ formatMoney(stats.monthTotal) }}</span>
          <span class="budget-status" :style="{ color: budgetState.color }">{{ budgetState.label }}</span>
        </div>
        <el-progress
          :percentage="budgetState.percent"
          :color="budgetState.color"
          :show-text="false"
          :stroke-width="10"
        />
        <div class="budget-sub">预算 {{ formatMoney(totalBudget.amount) }}</div>
      </div>
      <div v-else class="budget-empty">还没有设置本月预算，点右上角"设置预算"开始控制花销</div>

      <div v-if="categoryBudgetStates.length > 0" class="cat-budgets">
        <div v-for="b in categoryBudgetStates" :key="b.id" class="cat-budget-item">
          <span class="cat-budget-name">{{ b.name }}</span>
          <span class="cat-budget-spent">{{ formatMoney(b.spent) }} / {{ formatMoney(b.amount) }}</span>
          <span class="cat-budget-flag" :style="{ color: b.color }">{{ b.flag }}</span>
        </div>
      </div>
    </div>

    <div class="recent-card">
      <div class="recent-header">
        <span>最近账单</span>
        <el-link type="primary" :underline="false" @click="router.push('/bills')">查看全部</el-link>
      </div>
      <el-empty
        v-if="recent.length === 0"
        description="还没有账单，点右上角「记一笔」开始吧"
        :image-size="80"
      />
      <div v-else class="recent-list">
        <div v-for="item in recent" :key="item.id" class="recent-item">
          <div class="recent-left">
            <div class="recent-title">{{ item.subcategoryName }}</div>
            <div class="recent-sub">{{ item.date }}{{ item.note ? ' · ' + item.note : '' }}</div>
          </div>
          <div class="recent-amount">-{{ formatMoney(item.amount) }}</div>
        </div>
      </div>
    </div>

    <div class="data-tip">🔒 数据保存在本机文件中，不联网、不上传</div>

    <ExpenseDialog v-model="dialogVisible" :categories="categories" @saved="refresh" />
    <BudgetDialog v-model="budgetVisible" :categories="categories" @saved="refresh" />
  </div>
</template>

<script setup lang="ts">
// 首页：本月支出概览 + 本月预算进度 + 最近账单 + 记一笔入口
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import type { Budget, Category, Expense, HomeStats, MonthStats } from '../../../shared/types'
import { formatMoney } from '../utils/money'
import { currentMonth } from '../utils/date'
import { DELTA_COLORS } from '../utils/statsColors'
import ExpenseDialog from '../components/ExpenseDialog.vue'
import BudgetDialog from '../components/BudgetDialog.vue'

const router = useRouter()
const dialogVisible = ref(false)
const budgetVisible = ref(false)
const categories = ref<Category[]>([])
const stats = ref<HomeStats>({ monthTotal: 0, monthCount: 0, todayTotal: 0 })
const monthStats = ref<MonthStats | null>(null)
const budgets = ref<Budget[]>([])
const recent = ref<Expense[]>([])

const totalBudget = computed(() => budgets.value.find((b) => b.categoryId === null) ?? null)

/** 总预算进度状态：正常蓝色 → 用到 80% 橙色提醒 → 超支红色警告 */
const budgetState = computed(() => {
  const budget = totalBudget.value
  const spent = stats.value.monthTotal
  if (!budget) return { percent: 0, color: '#2a78d6', label: '' }
  if (spent > budget.amount) {
    return {
      percent: 100,
      color: DELTA_COLORS.up,
      label: `❗已超支 ${formatMoney(spent - budget.amount)}`
    }
  }
  if (spent >= budget.amount * 0.8) {
    return {
      percent: Math.round((spent / budget.amount) * 100),
      color: '#fab219',
      label: `⚠️ 仅剩 ${formatMoney(budget.amount - spent)}`
    }
  }
  return {
    percent: Math.round((spent / budget.amount) * 100),
    color: '#2a78d6',
    label: `剩余 ${formatMoney(budget.amount - spent)}`
  }
})

/** 各分类预算的执行情况 */
const categoryBudgetStates = computed(() => {
  const list = budgets.value.filter((b) => b.categoryId !== null)
  return list.map((b) => {
    const spent = monthStats.value?.categories.find((c) => c.categoryId === b.categoryId)?.total ?? 0
    if (spent > b.amount) return { id: b.id, name: b.categoryName ?? '', spent, amount: b.amount, color: DELTA_COLORS.up, flag: '❗超支' }
    if (spent >= b.amount * 0.8) return { id: b.id, name: b.categoryName ?? '', spent, amount: b.amount, color: '#fab219', flag: '⚠️' }
    return { id: b.id, name: b.categoryName ?? '', spent, amount: b.amount, color: '#898781', flag: '' }
  })
})

async function refresh(): Promise<void> {
  categories.value = await window.api.getCategories()
  stats.value = await window.api.getHomeStats(currentMonth())
  const [ms, bs] = await Promise.all([
    window.api.getMonthStats(currentMonth()),
    window.api.getBudgets(currentMonth())
  ])
  monthStats.value = ms
  budgets.value = bs
  const all = await window.api.listExpenses({ month: currentMonth() })
  recent.value = all.slice(0, 5)
}

onMounted(refresh)
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
  font-size: 28px;
  font-weight: 700;
  color: #303133;
}

.budget-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  margin-bottom: 16px;
}

.budget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
}

.budget-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.budget-status {
  font-weight: 600;
}

.budget-sub {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.budget-empty {
  font-size: 13px;
  color: #909399;
  padding: 8px 0;
}

.cat-budgets {
  margin-top: 12px;
  border-top: 1px solid #f0f2f5;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-budget-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.cat-budget-name {
  width: 80px;
  color: #303133;
}

.cat-budget-spent {
  flex: 1;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.cat-budget-flag {
  width: 56px;
  text-align: right;
  font-weight: 600;
}

.recent-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px 24px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.recent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  margin-bottom: 8px;
}

.recent-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #f0f2f5;
}

.recent-item:last-child {
  border-bottom: none;
}

.recent-title {
  font-size: 14px;
  font-weight: 500;
}

.recent-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.recent-amount {
  font-size: 15px;
  font-weight: 600;
  color: #f56c6c;
}

.data-tip {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
}
</style>
