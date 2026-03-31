import { ref } from 'vue';
import api from '../services/api';
import { useTaskStore } from '../stores/taskStore';
import type { ICard, IList } from '../types';

// Shared drag state
export const dragCard = ref<ICard | null>(null);
export const dragSourceListId = ref<string | null>(null);

// List drag state
export const dragList = ref<IList | null>(null);

export function useDragDrop() {
  const store = useTaskStore();

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
    // Inbox Draft is never a drop target
    if (sectionSlug === 'inbox') return false;
    return true;
  }

  async function onDrop(targetListId: string, dropIndex: number) {
    const card = dragCard.value;
    if (!card) return;

    const sameList = card.listId === targetListId;

    if (sameList) {
      // Reorder within the same list
      const currentCards = store.cardsForList(targetListId);
      const currentIndex = currentCards.findIndex(c => c._id === card._id);
      if (currentIndex === dropIndex || currentIndex === -1) return;

      try {
        const { data } = await api.patch(`/cards/${card._id}/reorder`, { order: dropIndex });
        // Refetch to get all updated orders
        await store.fetchDashboard();
      } catch (err) {
        console.error('Reorder failed:', err);
      }
    } else {
      // Move to different list
      try {
        const { data } = await api.patch(`/cards/${card._id}/move`, {
          targetListId,
          order: dropIndex,
        });
        await store.fetchDashboard();
      } catch (err) {
        console.error('Move failed:', err);
      }
    }

    dragCard.value = null;
    dragSourceListId.value = null;
  }

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

  // dropBefore: true = place before target, false = place after target
  async function onListDrop(targetList: IList, dropBefore: boolean) {
    const list = dragList.value;
    if (!list || list._id === targetList._id || list.sectionId !== targetList.sectionId) return;

    const targetOrder = dropBefore ? targetList.order : targetList.order + 1;

    try {
      await api.patch(`/lists/${list._id}/reorder`, { order: targetOrder });
      await store.fetchDashboard();
    } catch (err) {
      console.error('List reorder failed:', err);
    }

    dragList.value = null;
  }

  return { dragCard, dragSourceListId, onDragStart, onDragEnd, canDrop, onDrop,
           dragList, onListDragStart, onListDragEnd, onListDrop };
}
