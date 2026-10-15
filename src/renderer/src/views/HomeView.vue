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
  </div>
</template>

<script setup lang="ts">
// 首页：本月支出概览 + 最近账单 + 记一笔入口
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus } from '@element-plus/icons-vue'
import type { Category, Expense, HomeStats } from '../../../shared/types'
import { formatMoney } from '../utils/money'
import { currentMonth } from '../utils/date'
import ExpenseDialog from '../components/ExpenseDialog.vue'

const router = useRouter()
const dialogVisible = ref(false)
const categories = ref<Category[]>([])
const stats = ref<HomeStats>({ monthTotal: 0, monthCount: 0, todayTotal: 0 })
const recent = ref<Expense[]>([])

async function refresh(): Promise<void> {
  categories.value = await window.api.getCategories()
  stats.value = await window.api.getHomeStats(currentMonth())
  const all = await window.api.listExpenses(currentMonth())
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
