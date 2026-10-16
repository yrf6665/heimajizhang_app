<template>
  <el-dialog
    :model-value="modelValue"
    title="设置预算"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @open="init"
  >
    <div class="budget-form">
      <el-form label-width="90px">
        <el-form-item label="月份">
          <el-date-picker
            v-model="month"
            type="month"
            :clearable="false"
            format="YYYY年MM月"
            value-format="YYYY-MM"
            style="width: 100%"
            @change="loadBudgets"
          />
        </el-form-item>
        <el-form-item label="每月总预算">
          <el-input-number
            v-model="totalAmount"
            :min="0"
            :precision="2"
            :controls="false"
            style="width: 100%"
            placeholder="不设置可留空"
          />
        </el-form-item>
      </el-form>

      <div class="cat-budget-title">分类预算（可选）</div>
      <div v-for="row in catRows" :key="row.key" class="cat-budget-row">
        <el-select v-model="row.categoryId" placeholder="选择大类" style="width: 150px" filterable>
          <el-option v-for="c in availableCategories(row.key)" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-input-number
          v-model="row.amount"
          :min="0.01"
          :precision="2"
          :controls="false"
          style="flex: 1"
          placeholder="金额（元）"
        />
        <el-button link type="danger" @click="removeRow(row)">删除</el-button>
      </div>
      <el-button link type="primary" @click="addRow">+ 添加分类预算</el-button>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 预算设置弹窗：设每月总预算 + 可选分类预算（清空某个金额 = 删除该预算）
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Category } from '../../../shared/types'
import { centsToYuan, yuanToCents } from '../utils/money'
import { currentMonth } from '../utils/date'
import { errorMessage } from '../utils/errors'

const props = defineProps<{
  modelValue: boolean
  categories: Category[]
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  saved: []
}>()

interface CatRow {
  key: number
  /** 已有预算的 id（新建行时为 null） */
  id: number | null
  categoryId: number | null
  amount: number | null
}

const month = ref(currentMonth())
const totalAmount = ref<number | null>(null)
const catRows = ref<CatRow[]>([])
const origTotalId = ref<number | null>(null)
/** 本次操作中被用户删掉的已有预算 id，保存时一并删除 */
const removedIds = ref<number[]>([])
const saving = ref(false)
let keySeed = 0

function nextKey(): number {
  return ++keySeed
}

async function init(): Promise<void> {
  month.value = currentMonth()
  await loadBudgets()
}

async function loadBudgets(): Promise<void> {
  const budgets = await window.api.getBudgets(month.value)
  const total = budgets.find((b) => b.categoryId === null)
  origTotalId.value = total?.id ?? null
  totalAmount.value = total ? centsToYuan(total.amount) : null
  removedIds.value = []
  catRows.value = budgets
    .filter((b) => b.categoryId !== null)
    .map((b) => ({ key: nextKey(), id: b.id, categoryId: b.categoryId, amount: centsToYuan(b.amount) }))
}

/** 还没被其他行选中的大类 */
function availableCategories(rowKey: number): Category[] {
  return props.categories.filter((c) => !catRows.value.some((r) => r.key !== rowKey && r.categoryId === c.id))
}

function addRow(): void {
  catRows.value.push({ key: nextKey(), id: null, categoryId: null, amount: null })
}

function removeRow(row: CatRow): void {
  if (row.id !== null) removedIds.value.push(row.id)
  catRows.value = catRows.value.filter((r) => r.key !== row.key)
}

async function save(): Promise<void> {
  saving.value = true
  try {
    // 总预算：填了就保存，清空就删除
    if (totalAmount.value && totalAmount.value > 0) {
      await window.api.setBudget({ month: month.value, categoryId: null, amount: yuanToCents(totalAmount.value) })
    } else if (origTotalId.value !== null) {
      await window.api.deleteBudget(origTotalId.value)
    }

    // 分类预算
    for (const row of catRows.value) {
      if (row.categoryId === null) {
        ElMessage.warning('有分类预算没有选择大类，已跳过')
        continue
      }
      if (row.amount && row.amount > 0) {
        await window.api.setBudget({
          month: month.value,
          categoryId: row.categoryId,
          amount: yuanToCents(row.amount)
        })
      } else if (row.id !== null) {
        await window.api.deleteBudget(row.id)
      }
    }

    // 被删掉行的已有预算
    for (const id of removedIds.value) {
      await window.api.deleteBudget(id)
    }

    ElMessage.success('预算已保存')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(errorMessage(err))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.budget-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-budget-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 4px;
}

.cat-budget-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
</style>
