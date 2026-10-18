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
          <span v-if="editingCatId !== cat.id" class="cat-name">
            {{ cat.name }}
            <el-tag v-if="cat.isSystem" size="small" type="info" class="sys-badge">内置</el-tag>
          </span>
          <span v-else class="cat-edit">
            <el-input
              ref="catInput"
              v-model="editingCatName"
              size="small"
              style="width: 160px"
              @keyup.enter="confirmRenameCategory(cat)"
              @keyup.esc="cancelRename"
            />
            <el-button size="small" type="primary" @click="confirmRenameCategory(cat)">确定</el-button>
            <el-button size="small" @click="cancelRename">取消</el-button>
          </span>
          <span class="cat-actions">
            <el-button
              v-if="!cat.isSystem"
              link
              size="small"
              title="改名"
              @click="startRenameCategory(cat)"
            >
              <el-icon><Edit /></el-icon>
            </el-button>
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
          </span>
        </div>
        <div class="cat-subs">
          <template v-for="sub in cat.subcategories" :key="sub.id">
            <el-tag
              v-if="editingSubId !== sub.id"
              :closable="!sub.isSystem"
              size="large"
              @close="removeSubcategory(sub)"
            >
              {{ sub.name }}
              <el-icon v-if="!sub.isSystem" class="sub-edit-icon" @click.stop="startRenameSub(sub)">
                <Edit />
              </el-icon>
            </el-tag>
            <span v-else class="sub-edit">
              <el-input
                ref="subInput"
                v-model="editingSubName"
                size="small"
                style="width: 130px"
                @keyup.enter="confirmRenameSub"
                @keyup.esc="cancelRename"
              />
              <el-button size="small" type="primary" @click="confirmRenameSub">确定</el-button>
              <el-button size="small" @click="cancelRename">取消</el-button>
            </span>
          </template>
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

      <div class="cat-tip">提示：内置分类不能改名、不能删除；已有账单的分类也不能删除，以免账目丢失归属。</div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
// 分类管理弹窗：查看、新增、改名、删除两级分类
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit } from '@element-plus/icons-vue'
import type { Category, Subcategory } from '../../../shared/types'
import { errorMessage } from '../utils/errors'

const props = defineProps<{
  modelValue: boolean
  categories: Category[]
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
  changed: []
}>()

const newCategoryName = ref('')
const newSubNames = ref<Record<number, string>>({})

// 改名状态：正在改名的大类/小类编号和输入框内容
const editingCatId = ref<number | null>(null)
const editingCatName = ref('')
const editingSubId = ref<number | null>(null)
const editingSubName = ref('')
const catInput = ref<{ focus: () => void } | null>(null)
const subInput = ref<{ focus: () => void } | null>(null)

// 关闭弹窗时清空改名状态，下次打开是干净界面
watch(
  () => props.modelValue,
  (v) => {
    if (!v) cancelRename()
  }
)

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

async function startRenameCategory(cat: Category): Promise<void> {
  editingSubId.value = null
  editingCatId.value = cat.id
  editingCatName.value = cat.name
  await nextTick()
  catInput.value?.focus()
}

async function confirmRenameCategory(cat: Category): Promise<void> {
  const name = editingCatName.value.trim()
  if (!name) {
    ElMessage.warning('请输入大类名称')
    return
  }
  if (name === cat.name) {
    editingCatId.value = null
    return
  }
  try {
    await window.api.renameCategory(cat.id, name)
    ElMessage.success('已改名')
    editingCatId.value = null
    emit('changed')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

async function startRenameSub(sub: Subcategory): Promise<void> {
  editingCatId.value = null
  editingSubId.value = sub.id
  editingSubName.value = sub.name
  await nextTick()
  subInput.value?.focus()
}

async function confirmRenameSub(): Promise<void> {
  if (editingSubId.value === null) return
  const name = editingSubName.value.trim()
  if (!name) {
    ElMessage.warning('请输入小类名称')
    return
  }
  const original = props.categories
    .flatMap((c) => c.subcategories)
    .find((s) => s.id === editingSubId.value)?.name
  if (name === original) {
    editingSubId.value = null
    return
  }
  try {
    await window.api.renameSubcategory(editingSubId.value, name)
    ElMessage.success('已改名')
    editingSubId.value = null
    emit('changed')
  } catch (err) {
    ElMessage.error(errorMessage(err))
  }
}

function cancelRename(): void {
  editingCatId.value = null
  editingSubId.value = null
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

.sys-badge {
  margin-left: 6px;
}

.cat-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cat-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cat-subs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.sub-edit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sub-edit-icon {
  margin-left: 4px;
  color: #a8abb2;
  cursor: pointer;
}

.sub-edit-icon:hover {
  color: #2a78d6;
}

.cat-tip {
  font-size: 12px;
  color: #909399;
  padding-top: 6px;
  border-top: 1px solid #f0f2f5;
}
</style>
