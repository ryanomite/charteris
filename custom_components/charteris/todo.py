from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import CharterisApiClient
from .const import CONF_LIST_IDS, DATA_CLIENT, DATA_COORDINATOR, DOMAIN
from .coordinator import CharterisCoordinator


@dataclass(slots=True)
class _ResolvedItem:
    card: dict[str, Any]
    task: dict[str, Any]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    entry_data = hass.data[DOMAIN][entry.entry_id]
    coordinator: CharterisCoordinator = entry_data[DATA_COORDINATOR]
    client: CharterisApiClient = entry_data[DATA_CLIENT]

    selected_list_ids: list[str] = entry.options.get(CONF_LIST_IDS) or [
        item["_id"] for item in coordinator.data.get("lists", [])
    ]

    entities: list[CharterisTodoListEntity] = []
    for list_obj in coordinator.data.get("lists", []):
        if list_obj.get("_id") not in selected_list_ids:
            continue
        entities.append(CharterisTodoListEntity(entry, coordinator, client, list_obj["_id"], list_obj["name"]))

    async_add_entities(entities)


class CharterisTodoListEntity(CoordinatorEntity[CharterisCoordinator], TodoListEntity):
    """Expose a Charteris list as a Home Assistant to-do entity."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:format-list-checks"
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(
        self,
        entry: ConfigEntry,
        coordinator: CharterisCoordinator,
        client: CharterisApiClient,
        list_id: str,
        list_name: str,
    ) -> None:
        super().__init__(coordinator)
        self._entry = entry
        self._client = client
        self._list_id = list_id
        self._attr_unique_id = f"{entry.entry_id}_{list_id}"
        self._attr_name = list_name

    @property
    def todo_items(self) -> list[TodoItem]:
        return [self._to_todo_item(item) for item in self._resolved_items()]

    def _resolved_items(self) -> list[_ResolvedItem]:
        tasks_by_id = {task["_id"]: task for task in self.coordinator.data.get("tasks", [])}
        cards = [
            card for card in self.coordinator.data.get("cards", []) if card.get("listId") == self._list_id
        ]
        resolved: list[_ResolvedItem] = []
        for card in cards:
            task = tasks_by_id.get(card.get("taskId"))
            if not task:
                continue
            resolved.append(_ResolvedItem(card=card, task=task))
        resolved.sort(key=lambda item: item.card.get("order", 0))
        return resolved

    def _resolve_item_by_uid(self, uid: str) -> _ResolvedItem | None:
        return next((item for item in self._resolved_items() if item.card.get("_id") == uid), None)

    def _to_todo_item(self, item: _ResolvedItem) -> TodoItem:
        due = None
        due_raw = item.task.get("dueDate")
        if isinstance(due_raw, str) and due_raw:
            try:
                due = date.fromisoformat(due_raw)
            except ValueError:
                due = None

        completed = None
        status = TodoItemStatus.NEEDS_ACTION
        if item.task.get("completed"):
            status = TodoItemStatus.COMPLETED
            updated = item.task.get("updatedAt")
            if isinstance(updated, str):
                try:
                    completed = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                except ValueError:
                    completed = None

        return TodoItem(
            uid=item.card["_id"],
            summary=item.task.get("title", ""),
            status=status,
            due=due,
            description=item.task.get("description") or None,
            completed=completed,
        )

    async def async_create_todo_item(self, item: TodoItem) -> None:
        await self._client.async_create_task(
            list_id=self._list_id,
            title=item.summary,
            description=item.description,
            due_date=item.due if isinstance(item.due, date) else None,
        )
        await self.coordinator.async_request_refresh()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for uid in uids:
            await self._client.async_delete_card(uid)
        await self.coordinator.async_request_refresh()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        resolved = self._resolve_item_by_uid(item.uid)
        if resolved is None:
            return

        payload: dict[str, Any] = {}
        if item.summary != resolved.task.get("title"):
            payload["title"] = item.summary
        if item.description != (resolved.task.get("description") or None):
            payload["description"] = item.description or ""

        current_due_raw = resolved.task.get("dueDate")
        next_due = item.due.isoformat() if isinstance(item.due, date) else None
        if next_due != current_due_raw:
            payload["dueDate"] = next_due

        if payload:
            await self._client.async_update_task(resolved.task["_id"], payload)

        current_complete = bool(resolved.task.get("completed"))
        target_complete = item.status == TodoItemStatus.COMPLETED
        if current_complete != target_complete:
            await self._client.async_toggle_complete(resolved.task["_id"])

        await self.coordinator.async_request_refresh()
