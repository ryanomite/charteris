from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers import config_validation as cv

from .api import CharterisApiClient
from .const import (
    ATTR_DESCRIPTION,
    ATTR_DUE_DATE,
    ATTR_ENTRY_ID,
    ATTR_LIST_ID,
    ATTR_LIST_NAME,
    ATTR_PRIORITY,
    ATTR_TITLE,
    CONF_API_TOKEN,
    CONF_BASE_URL,
    DATA_CLIENT,
    DATA_COORDINATOR,
    DATA_UNSUB_OPTIONS,
    DOMAIN,
    SERVICE_CREATE_TASK,
)
from .coordinator import CharterisCoordinator

PLATFORMS: list[Platform] = [Platform.TODO]

SERVICE_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_ENTRY_ID): str,
        vol.Optional(ATTR_LIST_ID): str,
        vol.Optional(ATTR_LIST_NAME): str,
        vol.Required(ATTR_TITLE): str,
        vol.Optional(ATTR_DESCRIPTION, default=""): str,
        vol.Optional(ATTR_DUE_DATE): cv.date,
        vol.Optional(ATTR_PRIORITY): vol.All(vol.Coerce(int), vol.Range(min=1, max=5)),
    }
)


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    session = async_get_clientsession(hass)
    client = CharterisApiClient(
        base_url=entry.data[CONF_BASE_URL],
        api_token=entry.data[CONF_API_TOKEN],
        session=session,
    )
    coordinator = CharterisCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = {
        DATA_CLIENT: client,
        DATA_COORDINATOR: coordinator,
    }

    if not hass.services.has_service(DOMAIN, SERVICE_CREATE_TASK):
        hass.services.async_register(DOMAIN, SERVICE_CREATE_TASK, _async_handle_create_task, schema=SERVICE_SCHEMA)

    unsub = entry.add_update_listener(_async_update_listener)
    hass.data[DOMAIN][entry.entry_id][DATA_UNSUB_OPTIONS] = unsub

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False

    entry_data = hass.data[DOMAIN].pop(entry.entry_id, None)
    if entry_data and (unsub := entry_data.get(DATA_UNSUB_OPTIONS)):
        unsub()

    if not hass.data[DOMAIN] and hass.services.has_service(DOMAIN, SERVICE_CREATE_TASK):
        hass.services.async_remove(DOMAIN, SERVICE_CREATE_TASK)

    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_handle_create_task(call: ServiceCall) -> None:
    domain_data = call.hass.data.get(DOMAIN, {})
    if not domain_data:
        raise HomeAssistantError("Charteris is not configured")

    entry_id = call.data.get(ATTR_ENTRY_ID)
    if entry_id:
        if entry_id not in domain_data:
            raise HomeAssistantError("Invalid Charteris entry_id")
        entry_data = domain_data[entry_id]
    elif len(domain_data) == 1:
        entry_data = next(iter(domain_data.values()))
    else:
        raise HomeAssistantError("Multiple Charteris entries configured; specify entry_id")

    client: CharterisApiClient = entry_data[DATA_CLIENT]
    coordinator: CharterisCoordinator = entry_data[DATA_COORDINATOR]

    list_id = call.data.get(ATTR_LIST_ID)
    list_name = call.data.get(ATTR_LIST_NAME)
    if not list_id:
        if not list_name:
            raise HomeAssistantError("Either list_id or list_name is required")
        lists = await client.async_get_lists()
        matched = next((item for item in lists if item.get("name", "").lower() == str(list_name).lower()), None)
        if not matched:
            raise HomeAssistantError("No Charteris list matched list_name")
        list_id = matched.get("_id")

    await client.async_create_task(
        list_id=list_id,
        title=call.data[ATTR_TITLE],
        description=call.data.get(ATTR_DESCRIPTION),
        due_date=call.data.get(ATTR_DUE_DATE),
        priority=call.data.get(ATTR_PRIORITY),
    )
    await coordinator.async_request_refresh()
