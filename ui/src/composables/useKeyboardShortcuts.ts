import { onMounted, onUnmounted } from 'vue';
import { useSelection } from './useSelection';
import { hoveredCardId } from './useHoveredList';
import { useTaskStore } from '../stores/taskStore';
import { handleRecurringCompletion } from './useRecurrence';
import api from '../services/api';
import type { ICard } from '../types';

export function useKeyboardShortcuts(openCard: (card: ICard) => void) {
  const { selectedCards, focusedCardId, navigate, clearSelection } = useSelection();
  const store = useTaskStore();

  async function toggleComplete(cardIds: string[]) {
    for (const cardId of cardIds) {
      const card = store.cards.find(c => c._id === cardId);
      if (!card) continue;
      const task = store.taskById(card.taskId);
      if (!task) continue;
      try {
        const { data } = await api.patch(`/tasks/${task._id}/complete`);
        store.upsertTask(data);
        if (data.completed && data.recurrence) {
          await handleRecurringCompletion(data._id);
        }
      } catch (err) {
        console.error('Toggle complete failed:', err);
      }
    }
  }

  async function archiveCards(cardIds: string[]) {
    for (const cardId of cardIds) {
      const card = store.cards.find(c => c._id === cardId);
      if (!card) continue;
      const task = store.taskById(card.taskId);
      if (!task) continue;
      try {
        const { data } = await api.patch(`/tasks/${task._id}/archive`);
        store.upsertTask(data);
      } catch (err) {
        console.error('Archive failed:', err);
      }
    }
  }

  async function deleteCards(cardIds: string[]) {
    if (!confirm('Delete selected tasks?')) return;
    for (const cardId of cardIds) {
      const card = store.cards.find(c => c._id === cardId);
      if (!card) continue;
      try {
        await api.delete(`/cards/${card._id}`);
      } catch (err) {
        console.error('Delete failed:', err);
      }
    }
    clearSelection();
  }

  async function moveCard(cardId: string, targetListFinder: () => string | null) {
    const card = store.cards.find(c => c._id === cardId);
    if (!card) return;
    const targetListId = targetListFinder();
    if (!targetListId || targetListId === card.listId) return;
    try {
      await api.patch(`/cards/${card._id}/move`, { targetListId });
      await store.refreshListCards([card.listId, targetListId]);
    } catch (err) {
      console.error('Move failed:', err);
    }
  }

  function findListByNameInSection(sectionSlug: string, listName: string): string | null {
    const section = store.sections.find(s => s.slug === sectionSlug);
    if (!section) return null;
    const lists = store.listsForSection(section._id);
    const list = lists.find(l => l.name.toLowerCase() === listName.toLowerCase());
    return list?._id ?? null;
  }

  function findFirstBoardList(): string | null {
    const section = store.sections.find(s => s.slug === 'board');
    if (!section) return null;
    const lists = store.listsForSection(section._id);
    return lists.length > 0 ? lists[0]._id : null;
  }

  function getCardSection(cardId: string): string | null {
    const card = store.cards.find(c => c._id === cardId);
    if (!card) return null;
    const list = store.lists.find(l => l._id === card.listId);
    if (!list) return null;
    const section = store.sections.find(s => s._id === list.sectionId);
    return section?.slug ?? null;
  }

  function handleKeydown(e: KeyboardEvent) {
    // Ignore when typing in inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Q shortcut: quick add card (works without selection)
    if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      if (store.lastInteractedListId.value) {
        window.dispatchEvent(new CustomEvent('charteris:quick-add', { detail: { listId: store.lastInteractedListId.value } }));
      } else {
        window.dispatchEvent(new CustomEvent('charteris:quick-add-modal'));
      }
      return;
    }

    const baseIds = [...new Set(selectedCards.value.map(c => c._id))];
    const ids = baseIds.length > 0
      ? baseIds
      : (hoveredCardId.value ? [hoveredCardId.value] : []);
    if (ids.length === 0 && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (ids.length === 1) {
          // If exactly one card selected, check if Shift held for complete toggle
          toggleComplete(ids);
        } else if (ids.length > 1) {
          toggleComplete(ids);
        }
        break;

      case 'Backspace':
        e.preventDefault();
        archiveCards(ids);
        break;

      case 'Delete':
        e.preventDefault();
        deleteCards(ids);
        break;

      case 'ArrowUp':
        e.preventDefault();
        navigate('up', e.shiftKey);
        break;

      case 'ArrowDown':
        e.preventDefault();
        navigate('down', e.shiftKey);
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (ids.length === 1) {
          const slug = getCardSection(ids[0]);
          if (slug === 'board') {
            // Board card → move to Today
            moveCard(ids[0], () => findListByNameInSection('planning', 'Today'));
          } else {
            navigate('left');
          }
        } else {
          navigate('left');
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (ids.length === 1) {
          const slug = getCardSection(ids[0]);
          if (slug === 'planning') {
            const card = store.cards.find(c => c._id === ids[0]);
            const list = card ? store.lists.find(l => l._id === card.listId) : null;
            if (list?.name === 'Today') {
              // Today → move to Next
              moveCard(ids[0], () => findListByNameInSection('planning', 'Next'));
            } else if (list?.name === 'Next') {
              // Next → move to first Board list
              moveCard(ids[0], () => findFirstBoardList());
            } else {
              navigate('right');
            }
          } else {
            navigate('right');
          }
        } else {
          navigate('right');
        }
        break;

      case 'p':
      case 'P':
        // Priority shortcut — handled at component level via event bus if needed
        // For now, pressing P + 1-4 sets priority
        break;

      case 'Escape':
        clearSelection();
        break;
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
}
