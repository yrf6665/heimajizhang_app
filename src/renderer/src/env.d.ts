/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

import type { Api } from '../../shared/types'

declare global {
  interface Window {
    /** 数据接口：界面通过它读写账本数据 */
    api: Api
  }
}

export {}
