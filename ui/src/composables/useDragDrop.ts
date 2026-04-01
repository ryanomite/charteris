import { ref } from 'vue';
import api from '../services/api';
import { useTaskStore } from '../stores/taskStore';
import type { ICard, IList } from '../types';

// Shared drag state (module-level so all instances share it)
export const dragCard = ref<ICard | null>(null);
export const dragSourceListId = ref<string | null>(null);

// List drag state
export const dragList = ref<IList | null>(null);

// Touch drag internals
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let touchStartX = 0;
let touchStartY = 0;
let touchEarlyCleanup: (() => void) | null = null;

export function useDragDrop() {
  const store = useTaskStore();

  // --- Mouse / desktop drag ---

  function onDragStart(card: ICard, e: DragEvent) {
    dragCard.value = card;
    dragSourceListId.value = card.listId;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card._id);
    }
  }

  function onDragEnd() {
    dragCard.value = null;
    dragSourceListId.value = null;
  }

  function canDrop(listId: string, sectionSlug: string): boolean {
    if (!dragCard.value) return false;
    if (sectionSlug === 'inbox') return false;
    return true;
  }

  async function onDrop(targetListId: string, dropIndex: number) {
    const card = dragCard.value;
    if (!card) return;

    const sourceListId = card.listId;
    const sameList = sourceListId === targetListId;

    dragCard.value = null;
    dragSourceListId.value = null;

    if (sameList) {
      const currentCards = store.cardsForList(targetListId);
      const currentIndex = currentCards.findIndex(c => c._id === card._id);
      if (currentIndex === dropIndex || currentIndex === -1) return;
      try {
        await api.patch(`/cards/${card._id}/reorder`, { order: dropIndex });
        await store.refreshListCards([targetListId]);
      } catch (err) {
        console.error('Reorder failed:', err);
      }
    } else {
      try {
        await api.patch(`/cards/${card._id}/move`, { targetListId, order: dropIndex });
        await store.refreshListCards([sourceListId, targetListId]);
      } catch (err) {
        console.error('Move failed:', err);
      }
    }
  }

  // --- List header drag-to-reorder ---

  function onListDragStart(list: IList, e: DragEvent) {
    dragList.value = list;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', list._id);
    }
  }

  function onListDragEnd() {
    dragList.value = null;
  }

  async function onListDrop(targetList: IList, dropBefore: boolean) {
    const list = dragList.value;
    if (!list || list._id === targetList._id || list.sectionId !== targetList.sectionId) return;

    const sectionId = list.sectionId;
    const targetOrder = dropBefore ? targetList.order : targetList.order + 1;
    dragList.value = null;

    try {
      await api.patch(`/lists/${list._id}/reorder`, { order: targetOrder });
      await store.refreshSectionLists(sectionId);
    } catch (err) {
      console.error('List reorder failed:', err);
    }
  }

  // --- Touch drag (long-press to drag on mobile) ---

  function onCardTouchStart(card: ICard, e: TouchEvent) {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;

    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    touchEarlyCleanup?.();

    const el = e.currentTarget as HTMLElement;
    let dragging = false;
    let touchTargetListId: string | null = null;
    let touchDropIdx = -1;

    // Register as non-passive from the START so the browser never commits to scroll
    // mode before we have a chance to call preventDefault() once drag activates.
    const moveHandler = (ev: TouchEvent) => {
      const t = ev.touches[0];
      const dx = Math.abs(t.clientX - touchStartX);
      const dy = Math.abs(t.clientY - touchStartY);

      if (!dragging) {
        // Still in wait period — cancel if finger moved too much (it's a scroll)
        if (dx > 8 || dy > 8) {
          cleanup();
        }
        return; // Don't preventDefault — allow natural scroll until drag activates
      }

      // Drag is active: prevent scroll and find drop target
      ev.preventDefault();

      el.style.pointerEvents = 'none';
      const target = document.elementFromPoint(t.clientX, t.clientY);
      el.style.pointerEvents = '';

      let listEl: Element | null = target;
      while (listEl && !listEl.getAttribute('data-list-id')) {
        listEl = listEl.parentElement ?? null;
      }
      touchTargetListId = listEl?.getAttribute('data-list-id') ?? null;

      if (listEl) {
        const cardEls = Array.from(listEl.querySelectorAll('[data-card-id]'));
        let idx = cardEls.length;
        for (let i = 0; i < cardEls.length; i++) {
          const rect = cardEls[i].getBoundingClientRect();
          if (t.clientY < rect.top + rect.height / 2) { idx = i; break; }
        }
        touchDropIdx = idx;
      }
    };

    const endHandler = async () => {
      cleanup();
      if (dragging) {
        if (touchTargetListId) {
          await onDrop(touchTargetListId, touchDropIdx >= 0 ? touchDropIdx : -1);
        } else {
          dragCard.value = null;
          dragSourceListId.value = null;
        }
      }
    };

    const cleanup = () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      document.removeEventListener('touchmove', moveHandler);
      document.removeEventListener('touchend', endHandler);
      document.removeEventListener('touchcancel', endHandler);
      touchEarlyCleanup = null;
    };

    touchEarlyCleanup = cleanup;

    // Non-passive from the start — browser won't lock in scroll mode before drag fires
    document.addEventListener('touchmove', moveHandler, { passive: false });
    document.addEventListener('touchend', endHandler, { once: true });
    document.addEventListener('touchcancel', endHandler, { once: true });

    touchTimer = setTimeout(() => {
      dragging = true;
      dragCard.value = card;
      dragSourceListId.value = card.listId;
      if ('vibrate' in navigator) (navigator as any).vibrate(30);
    }, 250);
  }

  return {
    dragCard, dragSourceListId,
    onDragStart, onDragEnd, canDrop, onDrop,
    dragList, onListDragStart, onListDragEnd, onListDrop,
    onCardTouchStart,
  };
}
