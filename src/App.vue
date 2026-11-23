<script setup lang="ts">
import { RouterView } from 'vue-router'
import { provideModalState } from '@/composables/useModal'

provideModalState()
</script>

<template>
  <RouterView />
</template>
