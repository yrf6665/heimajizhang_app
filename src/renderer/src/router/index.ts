// 页面路由：决定左侧菜单点击后显示哪个页面
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import BillsView from '../views/BillsView.vue'

const router = createRouter({
  // 桌面软件用 hash 模式，打包后刷新也不会找不到页面
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/bills', name: 'bills', component: BillsView }
  ]
})

export default router
