"""
title: Charteris Task Manager
description: Create, view, complete, and manage tasks in Charteris — your personal task management tool.
author: Charteris
version: 1.0.0
license: MIT
"""

import json
import requests
from pydantic import BaseModel, Field


class Tools:
    class Valves(BaseModel):
        base_url: str = Field(
            default="http://localhost:8080",
            description="The base URL of your Charteris instance (no trailing slash)",
        )
        api_token: str = Field(
            default="",
            description="Your Charteris API token (the ?token= value)",
        )

    def __init__(self):
        self.valves = self.Valves()

    def _with_token(self, params: dict | None = None) -> dict:
        merged = dict(params or {})
        if self.valves.api_token:
            merged["token"] = self.valves.api_token
        return merged

    def _get(self, path: str, params: dict = None) -> dict | list:
        resp = requests.get(
            f"{self.valves.base_url}/api/v1{path}",
            params=self._with_token(params),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict) -> dict:
        resp = requests.post(
            f"{self.valves.base_url}/api/v1{path}",
            json=body,
            params=self._with_token(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    def _put(self, path: str, body: dict) -> dict:
        resp = requests.put(
            f"{self.valves.base_url}/api/v1{path}",
            json=body,
            params=self._with_token(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    # -------------------------------------------------------------------------
    # Task viewing
    # -------------------------------------------------------------------------

    def get_today_tasks(self) -> str:
        """
        Get all incomplete tasks currently in the Today list.
        Returns a JSON list of task objects with title, priority, dueDate, labels, etc.
        """
        dashboard = self._get("/dashboard")
        sections = dashboard.get("sections", [])
        lists = dashboard.get("lists", [])
        tasks = {t["_id"]: t for t in dashboard.get("tasks", [])}
        cards = dashboard.get("cards", [])

        planning = next((s for s in sections if s.get("slug") == "planning"), None)
        if not planning:
            return "[]"

        today_list = next(
            (l for l in lists if l.get("sectionId") == planning["_id"] and l.get("name", "").lower() == "today"),
            None,
        )
        if not today_list:
            return "[]"

        today_cards = [c for c in cards if c.get("listId") == today_list["_id"]]
        today_tasks = [
            tasks[c["taskId"]]
            for c in today_cards
            if c["taskId"] in tasks and not tasks[c["taskId"]].get("completed") and not tasks[c["taskId"]].get("archived")
        ]
        return json.dumps(today_tasks, indent=2)

    def get_tasks_in_list(self, list_name: str, include_completed: bool = False) -> str:
        """
        Get all tasks in a list by name (case-insensitive).

        Args:
            list_name: The name of the list, e.g. "Inbox", "Today", "Work"
            include_completed: Whether to include completed tasks (default False)

        Returns:
            A JSON list of task objects.
        """
        dashboard = self._get("/dashboard")
        lists = dashboard.get("lists", [])
        tasks = {t["_id"]: t for t in dashboard.get("tasks", [])}
        cards = dashboard.get("cards", [])

        target_list = next((l for l in lists if l.get("name", "").lower() == list_name.lower()), None)
        if not target_list:
            return f"List '{list_name}' not found"

        list_cards = [c for c in cards if c.get("listId") == target_list["_id"]]
        result = []
        for c in list_cards:
            task = tasks.get(c["taskId"])
            if not task or task.get("archived"):
                continue
            if not include_completed and task.get("completed"):
                continue
            result.append(task)
        return json.dumps(result, indent=2)

    def get_task(self, task_id: str) -> str:
        """
        Get a single task by its ID.

        Args:
            task_id: The task's _id hex string
        """
        try:
            task = self._get(f"/tasks/{task_id}")
            return json.dumps(task, indent=2)
        except requests.HTTPError as e:
            return f"Error: {e}"

    def list_lists(self) -> str:
        """
        List all available lists (from all sections: Inbox, Planning/Counter, Cabinet/Board).
        Useful for discovering list names before creating or viewing tasks.
        """
        dashboard = self._get("/dashboard")
        sections = {s["_id"]: s["name"] for s in dashboard.get("sections", [])}
        lists = dashboard.get("lists", [])
        result = [
            {"_id": l["_id"], "name": l["name"], "section": sections.get(l.get("sectionId", ""), "?")}
            for l in lists
            if not l.get("archived")
        ]
        return json.dumps(result, indent=2)

    # -------------------------------------------------------------------------
    # Task creation
    # -------------------------------------------------------------------------

    def create_task(
        self,
        title: str,
        list_name: str = "Inbox",
        description: str = "",
        priority: int = None,
        due_date: str = None,
        add_to_today: bool = False,
    ) -> str:
        """
        Create a new task and add it to a list.

        Args:
            title: Task title. Supports macros: p1-p5 (priority), @Label (labels),
                   #ListName (cabinet list), ! (add to Today), date keywords (today/tomorrow/weekday).
            list_name: Target list name (default "Inbox"). Created in Cabinet if it doesn't exist.
            description: Optional longer description.
            priority: Priority 1 (urgent) to 5 (rainy day / someday). Omit to leave unset.
            due_date: ISO date string, e.g. "2026-06-01". Omit if none.
            add_to_today: If True, also adds a card in the Today list.

        Returns:
            The created task as JSON.
        """
        body: dict = {
            "title": title,
            "description": description,
            "priority": priority,
            "dueDate": due_date,
        }
        # Remove None values so the API uses its defaults
        body = {k: v for k, v in body.items() if v is not None}

        # Find or create the target list
        dashboard = self._get("/dashboard")
        lists = dashboard.get("lists", [])
        sections = dashboard.get("sections", [])

        target_list = next((l for l in lists if l.get("name", "").lower() == list_name.lower()), None)

        if not target_list:
            # Create in Cabinet/Board
            board = next((s for s in sections if s.get("slug") == "board"), None)
            if not board:
                return "Error: Board section not found"
            new_list = self._post("/lists", {"name": list_name, "sectionId": board["_id"]})
            target_list = new_list

        # Create the task
        task = self._post("/tasks", body)
        task_id = task["_id"]

        # Add card to target list
        self._post("/cards", {"taskId": task_id, "listId": target_list["_id"]})

        # Optionally add to Today
        if add_to_today:
            planning = next((s for s in sections if s.get("slug") == "planning"), None)
            if planning:
                today_list = next(
                    (l for l in lists if l.get("sectionId") == planning["_id"] and l.get("name", "").lower() == "today"),
                    None,
                )
                if today_list:
                    self._post("/cards", {"taskId": task_id, "listId": today_list["_id"]})

        return json.dumps(task, indent=2)

    # -------------------------------------------------------------------------
    # Task editing
    # -------------------------------------------------------------------------

    def update_task(
        self,
        task_id: str,
        title: str = None,
        description: str = None,
        priority: int = None,
        due_date: str = None,
    ) -> str:
        """
        Update fields of an existing task.

        Args:
            task_id: The task's _id hex string.
            title: New title (optional).
            description: New description (optional).
            priority: New priority 1–5 (optional).
            due_date: New ISO due date, e.g. "2026-07-01", or "" to clear it (optional).
        """
        body = {}
        if title is not None:
            body["title"] = title
        if description is not None:
            body["description"] = description
        if priority is not None:
            body["priority"] = priority
        if due_date is not None:
            body["dueDate"] = due_date or None

        if not body:
            return "No fields to update"
        try:
            task = self._put(f"/tasks/{task_id}", body)
            return json.dumps(task, indent=2)
        except requests.HTTPError as e:
            return f"Error: {e}"

    def complete_task(self, task_id: str) -> str:
        """
        Mark a task as completed.

        Args:
            task_id: The task's _id hex string.
        """
        try:
            task = self._put(f"/tasks/{task_id}", {"completed": True})
            return f"Task '{task.get('title')}' marked as completed."
        except requests.HTTPError as e:
            return f"Error: {e}"

    def reopen_task(self, task_id: str) -> str:
        """
        Mark a completed task as not completed (reopen it).

        Args:
            task_id: The task's _id hex string.
        """
        try:
            task = self._put(f"/tasks/{task_id}", {"completed": False})
            return f"Task '{task.get('title')}' reopened."
        except requests.HTTPError as e:
            return f"Error: {e}"
