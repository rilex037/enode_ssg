<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: string
    class?: string
  }>(),
  { class: '' },
)

const SYMBOLS: Record<string, string> = {
  arrow: 'i-arr',
  up: 'i-up',
  pin: 'i-pin',
  phone: 'i-phone',
  mail: 'i-mail',
  whatsapp: 'i-wa',
  instagram: 'i-ig',
  facebook: 'i-fb',
  calendar: 'i-cal',
  shield: 'i-shield',
  team: 'i-team',
  clock: 'i-clock',
  leaf: 'i-leaf',
  star: 's-star',
  home: 's-home',
  spray: 's-spray',
  hat: 's-hat',
  window: 's-window',
  sofa: 's-sofa',
  floor: 's-floor',
  close: 'i-x',
  send: 'i-send',
}

const symbolId = computed(() => SYMBOLS[props.name] ?? `i-${props.name}`)
const href = computed(() => `#${symbolId.value}`)
</script>

<template>
  <svg class="icon" :class="$props.class" aria-hidden="true" focusable="false">
    <use :href="href" />
  </svg>
</template>
