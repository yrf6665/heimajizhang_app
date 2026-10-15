<template>
  <div ref="el" class="e-chart" :style="{ height }"></div>
</template>

<script setup lang="ts">
// 通用图表容器：把 ECharts 图表挂载到页面，数据变化自动更新，窗口大小变化自动调整
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

const props = withDefaults(defineProps<{ option: EChartsOption; height?: string }>(), {
  height: '300px'
})

const el = ref<HTMLDivElement>()
let chart: ReturnType<typeof echarts.init> | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  chart = echarts.init(el.value as HTMLDivElement)
  chart.setOption(props.option)
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(el.value as HTMLDivElement)
})

watch(
  () => props.option,
  (opt) => chart?.setOption(opt, true)
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.e-chart {
  width: 100%;
}
</style>
