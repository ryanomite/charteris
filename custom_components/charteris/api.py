from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from aiohttp import ClientSession, ClientTimeout


class CharterisApiError(Exception):
    """Raised when the Charteris API returns an error."""


@dataclass(slots=True)
class CharterisApiClient:
    base_url: str
    api_token: str
    session: ClientSession

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        query = {"token": self.api_token}
        if params:
            query.update(params)

        url = f"{self.base_url}/api/v1{path}"
        timeout = ClientTimeout(total=15)
        async with self.session.request(method, url, params=query, json=json, timeout=timeout) as response:
            if response.status >= 400:
                try:
                    payload = await response.json()
                    message = payload.get("error") or payload.get("message") or str(payload)
                except Exception:
                    message = await response.text()
                raise CharterisApiError(f"{response.status}: {message}")

            if response.content_type.startswith("application/json"):
                return await response.json()
            return await response.text()

    async def async_validate(self) -> list[dict[str, Any]]:
        return await self.async_get_lists()

    async def async_get_lists(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/lists")
        return data if isinstance(data, list) else []

    async def async_get_dashboard(self) -> dict[str, Any]:
        data = await self._request("GET", "/dashboard")
        return data if isinstance(data, dict) else {}

    async def async_create_task(
        self,
        *,
        list_id: str,
        title: str,
        description: str | None = None,
        due_date: date | None = None,
        priority: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "title": title,
            "description": description or "",
            "listId": list_id,
        }
        if due_date is not None:
            payload["dueDate"] = due_date.isoformat()
        if priority is not None:
            payload["priority"] = priority
        return await self._request("POST", "/tasks", json=payload)

    async def async_update_task(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PUT", f"/tasks/{task_id}", json=payload)

    async def async_toggle_complete(self, task_id: str) -> dict[str, Any]:
        return await self._request("PATCH", f"/tasks/{task_id}/complete")

    async def async_delete_card(self, card_id: str) -> None:
        await self._request("DELETE", f"/cards/{card_id}")
