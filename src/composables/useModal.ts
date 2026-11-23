import { inject, provide, ref, type Ref } from 'vue'

export interface ModalState {
  bookingOpen: Ref<boolean>
  serviceOpen: Ref<boolean>
  activeServiceKey: Ref<string | null>
  openBooking: () => void
  closeBooking: () => void
  openService: (key: string) => void
  closeService: () => void
  closeAll: () => void
}

const MODAL_KEY = Symbol('speedy-modal')

/**
 * Modal state is created per app instance (and not as module-level state) so
 * that the server-side render of one route can never leak into another.
 */
export function createModalState(): ModalState {
  const bookingOpen = ref(false)
  const serviceOpen = ref(false)
  const activeServiceKey = ref<string | null>(null)

  const openBooking = () => {
    bookingOpen.value = true
  }
  const closeBooking = () => {
    bookingOpen.value = false
  }
  const openService = (key: string) => {
    activeServiceKey.value = key
    serviceOpen.value = true
  }
  const closeService = () => {
    serviceOpen.value = false
  }
  const closeAll = () => {
    bookingOpen.value = false
    serviceOpen.value = false
  }

  return {
    bookingOpen,
    serviceOpen,
    activeServiceKey,
    openBooking,
    closeBooking,
    openService,
    closeService,
    closeAll,
  }
}

export function provideModalState(): ModalState {
  const state = createModalState()
  provide(MODAL_KEY, state)
  return state
}

export function useModalState(): ModalState {
  const state = inject<ModalState | null>(MODAL_KEY, null)
  if (!state) {
    throw new Error('useModalState() called outside of a component that provides the modal state')
  }
  return state
}
