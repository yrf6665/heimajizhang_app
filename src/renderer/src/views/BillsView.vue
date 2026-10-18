<template>
  <div class="bills">
    <div class="page-header">
      <h2>账单</h2>
      <div class="header-actions">
        <el-button @click="manageVisible = true">分类管理</el-button>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>&nbsp;记一笔
        </el-button>
      </div>
    </div>

    <!-- 筛选栏：月份 / 起止日期 / 大类 / 关键词，可组合使用 -->
    <div class="filter-bar">
      <el-date-picker
        v-model="month"
        type="month"
        :clearable="false"
        format="YYYY年MM月"
        value-format="YYYY-MM"
        placeholder="选择月份"
        @change="onMonthChange"
      />
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        @change="onRangeChange"
      />
      <el-select v-model="filterCategoryId" placeholder="全部分类" clearable style="width: 130px" @change="load">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索备注或分类"
        clearable
        style="width: 190px"
        :prefix-icon="Search"
        @input="load"
      />
      <el-button @click="reset">重置</el-button>
      <div class="filter-spacer"></div>
      <el-button type="success" :icon="Download" @click="exportExcel">导出Excel</el-button>
    </div>

    <div class="summary-bar">
      {{ summaryText }} 共 {{ monthCount }} 笔 · 合计 <b>{{ formatMoney(monthTotal) }}</b>
    </div>

    <el-table :data="expenses" stripe empty-text="没有符合条件的账单">
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
// 账单页：按月/日期范围/分类/关键词浏览账单，支持编辑、删除、分类管理、导出 Excel
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Plus, Search } from '@element-plus/icons-vue'
import type { Category, Expense, ExpenseFilters } from '../../../shared/types'
import { formatMoney } from '../utils/money'
import { currentMonth } from '../utils/date'
import { errorMessage } from '../utils/errors'
import ExpenseDialog from '../components/ExpenseDialog.vue'
import CategoryManageDialog from '../components/CategoryManageDialog.vue'

const month = ref(currentMonth())
const dateRange = ref<[string, string] | null>(null)
const filterCategoryId = ref<number | null>(null)
const keyword = ref('')
const expenses = ref<Expense[]>([])
const categories = ref<Category[]>([])
const dialogVisible = ref(false)
const manageVisible = ref(false)
const editing = ref<Expense | null>(null)

const monthTotal = computed(() => expenses.value.reduce((sum, e) => sum + e.amount, 0))
const monthCount = computed(() => expenses.value.length)

const summaryText = computed(() => {
  if (dateRange.value) return `${dateRange.value[0]} ~ ${dateRange.value[1]}`
  if (month.value) return month.value
  return '全部'
})

async function load(): Promise<void> {
  const filters: ExpenseFilters = {}
  if (dateRange.value) {
    filters.dateFrom = dateRange.value[0]
    filters.dateTo = dateRange.value[1]
  } else if (month.value) {
    filters.month = month.value
  }
  if (filterCategoryId.value) filters.categoryId = filterCategoryId.value
  const kw = keyword.value.trim()
  if (kw) filters.keyword = kw
  expenses.value = await window.api.listExpenses(filters)
}

async function loadCategories(): Promise<void> {
  categories.value = await window.api.getCategories()
}

/** 选了月份就清掉日期范围（两个日期条件二选一） */
function onMonthChange(): void {
  dateRange.value = null
  load()
}

/** 选了日期范围就清掉月份 */
function onRangeChange(): void {
  month.value = ''
  load()
}

function reset(): void {
  month.value = currentMonth()
  dateRange.value = null
  filterCategoryId.value = null
  keyword.value = ''
  load()
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

/** 把当前筛选看到的账单导出成 Excel 文件 */
async function exportExcel(): Promise<void> {
  if (expenses.value.length === 0) {
    ElMessage.warning('当前没有可导出的账单')
    return
  }
  const name = dateRange.value
    ? `记账App账单_${dateRange.value[0]}_${dateRange.value[1]}`
    : `记账App账单_${month.value || '全部'}`
  try {
    const res = await window.api.exportExcel(expenses.value, name)
    if (!res.canceled) ElMessage.success(`已导出：${res.path}`)
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
  margin-bottom: 12px;
}

.page-header h2 {
  font-size: 20px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.filter-bar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.filter-spacer {
  flex: 1;
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
