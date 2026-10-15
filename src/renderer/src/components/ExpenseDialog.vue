<template>
  <el-dialog
    :model-value="modelValue"
    :title="editing ? '编辑账单' : '记一笔'"
    width="460px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @open="reset"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="70px">
      <el-form-item label="金额" prop="amount">
        <el-input-number
          v-model="form.amount"
          :min="0.01"
          :max="9999999.99"
          :precision="2"
          :controls="false"
          style="width: 100%"
          placeholder="花了多少钱（元）"
        />
      </el-form-item>
      <el-form-item label="日期" prop="date">
        <el-date-picker
          v-model="form.date"
          type="date"
          :clearable="false"
          value-format="YYYY-MM-DD"
          format="YYYY年MM月DD日"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item label="分类" prop="subcategoryId">
        <el-cascader
          v-model="form.cascaderValue"
          :options="categories"
          :props="{ value: 'id', label: 'name', children: 'subcategories', emitPath: true }"
          placeholder="先选大类，再选小类"
          style="width: 100%"
          @change="onCascaderChange"
        />
      </el-form-item>
      <el-form-item label="备注" prop="note">
        <el-input
          v-model="form.note"
          type="textarea"
          :rows="2"
          maxlength="100"
          show-word-limit
          placeholder="可选，例如：和同事聚餐"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
// 记一笔 / 编辑账单的弹窗表单
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import type { Category, Expense, ExpenseInput } from '../../../shared/types'
import { centsToYuan, yuanToCents } from '../utils/money'
import { today } from '../utils/date'
import { errorMessage } from '../utils/errors'

const props = defineProps<{
  modelValue: boolean
  categories: Category[]
  editing?: Expense | null
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  saved: []
}>()

const formRef = ref<FormInstance>()
const saving = ref(false)

const form = reactive({
  amount: null as number | null,
  date: today(),
  subcategoryId: undefined as number | undefined,
  cascaderValue: [] as number[],
  note: ''
})

const rules: FormRules = {
  amount: [
    { required: true, message: '请输入金额', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value && value > 0) callback()
        else callback(new Error('金额必须大于 0'))
      },
      trigger: 'change'
    }
  ],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  subcategoryId: [
    {
      validator: (_rule, _value, callback) => {
        if (form.subcategoryId) callback()
        else callback(new Error('请选择分类'))
      },
      trigger: 'change'
    }
  ]
}

/** 弹窗每次打开时：编辑模式填入原数据，新增模式恢复默认值 */
function reset(): void {
  if (props.editing) {
    form.amount = centsToYuan(props.editing.amount)
    form.date = props.editing.date
    form.subcategoryId = props.editing.subcategoryId
    form.cascaderValue = [props.editing.categoryId, props.editing.subcategoryId]
    form.note = props.editing.note
  } else {
    form.amount = null
    form.date = today()
    form.subcategoryId = undefined
    form.cascaderValue = []
    form.note = ''
  }
  formRef.value?.clearValidate()
}

function onCascaderChange(value: number[]): void {
  form.subcategoryId = value.length >= 2 ? value[1] : undefined
}

async function save(): Promise<void> {
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  saving.value = true
  try {
    const input: ExpenseInput = {
      amount: yuanToCents(form.amount as number),
      date: form.date,
      subcategoryId: form.subcategoryId as number,
      note: form.note.trim()
    }
    if (props.editing) await window.api.updateExpense(props.editing.id, input)
    else await window.api.createExpense(input)
    ElMessage.success('已保存')
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    ElMessage.error(errorMessage(err))
  } finally {
    saving.value = false
  }
}
</script>
