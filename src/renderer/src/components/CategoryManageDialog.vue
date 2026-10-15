<template>
  <el-dialog
    :model-value="modelValue"
    title="分类管理"
    width="580px"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="cat-manage">
      <div class="cat-add-row">
        <el-input
          v-model="newCategoryName"
          placeholder="新大类名称，例如：宠物"
          style="width: 220px"
          @keyup.enter="addCategory"
        />
        <el-button type="primary" @click="addCategory">添加大类</el-button>
      </div>

      <div v-for="cat in categories" :key="cat.id" class="cat-row">
        <div class="cat-head">
          <span class="cat-name">{{ cat.name }}</span>
          <el-popconfirm
            v-if="!cat.isSystem"
            :title="`确定删除大类「${cat.name}」吗？其下的小类会一起删除。`"
            confirm-button-text="删除"
            cancel-button-text="取消"
            @confirm="removeCategory(cat)"
          >
            <template #reference>
              <el-button link type="danger" size="small">删除大类</el-button>
            </template>
          </el-popconfirm>
        </div>
        <div class="cat-subs">
          <el-tag
            v-for="sub in cat.subcategories"
            :key="sub.id"
            :closable="!sub.isSystem"
            size="large"
            @close="removeSubcategory(sub)"
          >
            {{ sub.name }}
          </el-tag>
          <el-input
            v-model="newSubNames[cat.id]"
            size="small"
            placeholder="新小类名称"
            style="width: 120px"
            @keyup.enter="addSubcategory(cat)"
          />
          <el-button size="small" @click="addSubcategory(cat)">添加</el-button>
        </div>
      </div>

      <div class="cat-tip">提示：内置分类不能删除；已有账单的分类也不能删除，以免账目丢失归属。</div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
// 分类管理弹窗：查看、新增、删除两级分类
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Category, Subcategory } from '../../../shared/types'
import { errorMessage } from '../utils/errors'

defineProps<{
  modelValue: boolean
  categories: Category[]
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  changed: []
}>()

const newCategoryName = ref('')
const newSubNames = ref<Record<number, string>>({})

async function addCategory(): Promise<void> {
  const name = newCategoryName.value.trim()
  if (!name) {
    ElMessage.warning('请输入大类名称')
    return
  }
  try {
    await window.api.addCategory(name)
    ElMessage.success('已添加大类')
    newCategoryName.value = ''
    emit('changed')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function removeCategory(cat: Category): Promise<void> {
  try {
    await window.api.deleteCategory(cat.id)
    ElMessage.success('已删除')
    emit('changed')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function addSubcategory(cat: Category): Promise<void> {
  const name = (newSubNames.value[cat.id] ?? '').trim()
  if (!name) {
    ElMessage.warning('请输入小类名称')
    return
  }
  try {
    await window.api.addSubcategory(cat.id, name)
    ElMessage.success('已添加小类')
    newSubNames.value[cat.id] = ''
    emit('changed')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function removeSubcategory(sub: Subcategory): Promise<void> {
  try {
    await window.api.deleteSubcategory(sub.id)
    ElMessage.success('已删除')
    emit('changed')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}
</script>

<style scoped>
.cat-manage {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cat-add-row {
  display: flex;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f0f2f5;
}

.cat-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cat-name {
  font-weight: 600;
  font-size: 14px;
}

.cat-subs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cat-tip {
  font-size: 12px;
  color: #909399;
  padding-top: 6px;
  border-top: 1px solid #f0f2f5;
}
</style>
