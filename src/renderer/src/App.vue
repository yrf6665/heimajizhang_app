<template>
  <el-container class="app-layout">
    <el-aside width="200px" class="app-sidebar">
      <div class="logo">
        <div class="logo-icon">📒</div>
        <span>记账App</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        class="side-menu"
        background-color="#263445"
        text-color="#cfd6e0"
        active-text-color="#409eff"
      >
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <span>首页</span>
        </el-menu-item>
        <el-menu-item index="/bills">
          <el-icon><List /></el-icon>
          <span>账单</span>
        </el-menu-item>
        <el-menu-item index="/stats">
          <el-icon><PieChart /></el-icon>
          <span>统计</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main class="app-main">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
// 软件的整体布局：左侧菜单栏 + 右侧内容区
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { HomeFilled, List, PieChart } from '@element-plus/icons-vue'

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<style scoped>
.app-layout {
  height: 100%;
}

.app-sidebar {
  background: #263445;
  display: flex;
  flex-direction: column;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px 18px;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.logo-icon {
  font-size: 28px;
}

.side-menu {
  border-right: none;
  flex: 1;
}

.app-main {
  padding: 20px 24px;
  overflow: auto;
}
</style>
