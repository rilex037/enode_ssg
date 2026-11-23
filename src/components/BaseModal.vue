<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** Id of the element that labels the dialog (aria-labelledby). */
    labelledBy?: string
    /** Removes the internal scrollbar compensation, used by the wide service modal. */
    scrollable?: boolean
  }>(),
  { labelledBy: undefined, scrollable: false },
)

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)
let previousOverflow = ''

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    emit('close')
  }
}

function lockScroll() {
  if (typeof document === 'undefined') return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  if (typeof document === 'undefined') return
  document.body.style.overflow = previousOverflow
}

watch(
  () => props.open,
  async (open) => {
    if (typeof document === 'undefined') return
    if (open) {
      lockScroll()
      document.addEventListener('keydown', onKeydown)
      await nextTick()
      panel.value?.focus()
    } else {
      unlockScroll()
      document.removeEventListener('keydown', onKeydown)
    }
  },
)

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return
  document.removeEventListener('keydown', onKeydown)
  unlockScroll()
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[1050] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          tabindex="-1"
          class="relative w-full overflow-hidden rounded-2xl bg-white shadow-[0_12px_36px_rgba(0,0,0,0.25)] outline-none"
          :class="scrollable ? 'max-w-3xl' : 'max-w-lg'"
        >
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
