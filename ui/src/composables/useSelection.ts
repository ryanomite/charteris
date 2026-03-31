import { ref, computed } from 'vue';
import { useTaskStore } from '../stores/taskStore';
import type { ICard } from '../types';

const selectedCardIds = ref<Set<string>>(new Set());
const focusedCardId = ref<string | null>(null);

export function useSelection() {
  const store = useTaskStore();

  const selectedCards = computed(() =>
    [...selectedCardIds.value]
      .map(id => store.cards.find(c => c._id === id))
      .filter((c): c is ICard => c != null)
  );

  function selectCard(cardId: string, opts?: { ctrl?: boolean; shift?: boolean }) {
    if (opts?.ctrl) {
      // Toggle card in selection
      const next = new Set(selectedCardIds.value);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      selectedCardIds.value = next;
      focusedCardId.value = cardId;
    } else if (opts?.shift && focusedCardId.value) {
      // Range select within the same list
      const anchor = store.cards.find(c => c._id === focusedCardId.value);
      const target = store.cards.find(c => c._id === cardId);
      if (anchor && target && anchor.listId === target.listId) {
        const listCards = store.cardsForList(anchor.listId);
        const anchorIdx = listCards.findIndex(c => c._id === anchor._id);
        const targetIdx = listCards.findIndex(c => c._id === cardId);
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const next = new Set(selectedCardIds.value);
        for (let i = start; i <= end; i++) {
          next.add(listCards[i]._id);
        }
        selectedCardIds.value = next;
      }
    } else {
      // Single select (replace)
      selectedCardIds.value = new Set([cardId]);
      focusedCardId.value = cardId;
    }
  }

  function clearSelection() {
    selectedCardIds.value = new Set();
    focusedCardId.value = null;
  }

  function isSelected(cardId: string): boolean {
    return selectedCardIds.value.has(cardId);
  }

  function isFocused(cardId: string): boolean {
    return focusedCardId.value === cardId;
  }

  // Navigate to adjacent card
  function navigate(direction: 'up' | 'down' | 'left' | 'right', extend?: boolean) {
    const anchor = focusedCardId.value;
    if (!anchor) return;

    const anchorCard = store.cards.find(c => c._id === anchor);
    if (!anchorCard) return;

    const listCards = store.cardsForList(anchorCard.listId);
    const idx = listCards.findIndex(c => c._id === anchor);

    if (direction === 'up' && idx > 0) {
      const target = listCards[idx - 1];
      if (extend) {
        const next = new Set(selectedCardIds.value);
        next.add(target._id);
        selectedCardIds.value = next;
      } else {
        selectedCardIds.value = new Set([target._id]);
      }
      focusedCardId.value = target._id;
    } else if (direction === 'down' && idx < listCards.length - 1) {
      const target = listCards[idx + 1];
      if (extend) {
        const next = new Set(selectedCardIds.value);
        next.add(target._id);
        selectedCardIds.value = next;
      } else {
        selectedCardIds.value = new Set([target._id]);
      }
      focusedCardId.value = target._id;
    } else if (direction === 'left' || direction === 'right') {
      // Move to adjacent list
      const currentList = store.lists.find(l => l._id === anchorCard.listId);
      if (!currentList) return;

      const sectionLists = store.listsForSection(currentList.sectionId);
      const listIdx = sectionLists.findIndex(l => l._id === currentList._id);
      const nextListIdx = direction === 'left' ? listIdx - 1 : listIdx + 1;

      if (nextListIdx >= 0 && nextListIdx < sectionLists.length) {
        const nextList = sectionLists[nextListIdx];
        const nextCards = store.cardsForList(nextList._id);
        if (nextCards.length > 0) {
          const targetCard = nextCards[Math.min(idx, nextCards.length - 1)];
          selectedCardIds.value = new Set([targetCard._id]);
          focusedCardId.value = targetCard._id;
        }
      }
    }
  }

  return {
    selectedCardIds,
    focusedCardId,
    selectedCards,
    selectCard,
    clearSelection,
    isSelected,
    isFocused,
    navigate,
  };
}
