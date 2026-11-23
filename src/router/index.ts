import type { RouteRecordRaw } from 'vue-router'

/**
 * Every route is prerendered to a real HTML file:
 *   "/"    -> dist/index.html
 *   "/404" -> dist/404.html
 *
 * Add your own routes here. Each route is rendered to static HTML at build
 * time by vite-ssg.
 */
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/pages/HomePage.vue'),
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('@/pages/NotFoundPage.vue'),
    alias: '/404.html',
  },
  {
    // Catch-all renders the 404 page for any unknown URL.
    path: '/:pathMatch(.*)*',
    name: 'catch-all',
    component: () => import('@/pages/NotFoundPage.vue'),
  },
]
