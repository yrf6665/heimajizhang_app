<template>
  <div class="bills">
    <div class="page-header">
      <h2>账单</h2>
      <div class="header-actions">
        <el-date-picker
          v-model="month"
          type="month"
          :clearable="false"
          format="YYYY年MM月"
          value-format="YYYY-MM"
          @change="load"
        />
        <el-button @click="manageVisible = true">分类管理</el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>&nbsp;记一笔
        </el-button>
      </div>
    </div>

    <div class="summary-bar">
      {{ month }} 共 {{ monthCount }} 笔 · 合计 <b>{{ formatMoney(monthTotal) }}</b>
    </div>

    <el-table :data="expenses" stripe empty-text="这个月还没有账单，点右上角「记一笔」吧">
      <el-table-column prop="date" label="日期" width="120" />
      <el-table-column label="分类" min-width="170">
        <template #default="{ row }">{{ row.categoryName }} / {{ row.subcategoryName }}</template>
      </el-table-column>
      <el-table-column label="金额" width="150" align="right">
        <template #default="{ row }">
          <span class="amount-text">-{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="note" label="备注" min-width="180" show-overflow-tooltip />
      <el-table-column label="操作" width="130" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <ExpenseDialog v-model="dialogVisible" :categories="categories" :editing="editing" @saved="load" />
    <CategoryManageDialog v-model="manageVisible" :categories="categories" @changed="loadCategories" />
  </div>
</template>

<script setup lang="ts">
// 账单页：按月浏览所有账单，支持编辑、删除、分类管理
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { Category, Expense } from '../../../shared/types'
import { formatMoney } from '../utils/money'
import { currentMonth } from '../utils/date'
import { errorMessage } from '../utils/errors'
import ExpenseDialog from '../components/ExpenseDialog.vue'
import CategoryManageDialog from '../components/CategoryManageDialog.vue'

const month = ref(currentMonth())
const expenses = ref<Expense[]>([])
const categories = ref<Category[]>([])
const dialogVisible = ref(false)
const manageVisible = ref(false)
const editing = ref<Expense | null>(null)

const monthTotal = computed(() => expenses.value.reduce((sum, e) => sum + e.amount, 0))
const monthCount = computed(() => expenses.value.length)

async function load(): Promise<void> {
  expenses.value = await window.api.listExpenses(month.value)
}

async function loadCategories(): Promise<void> {
  categories.value = await window.api.getCategories()
}

function openCreate(): void {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: Expense): void {
  editing.value = row
  dialogVisible.value = true
}

async function remove(row: Expense): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除这笔「${row.subcategoryName} ${formatMoney(row.amount)}」吗？删除后无法恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await window.api.deleteExpense(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

onMounted(() => {
  load()
  loadCategories()
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

.summary-bar {
  margin-bottom: 12px;
  font-size: 13px;
  color: #606266;
}

.amount-text {
  color: #f56c6c;
  font-weight: 600;
}
</style>
