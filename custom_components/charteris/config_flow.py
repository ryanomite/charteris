from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import CharterisApiClient, CharterisApiError
from .const import CONF_API_TOKEN, CONF_BASE_URL, CONF_LIST_IDS, DOMAIN


class CharterisConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Charteris."""

    VERSION = 1

    def __init__(self) -> None:
        self._base_url: str = ""
        self._api_token: str = ""
        self._available_lists: list[dict[str, Any]] = []

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        errors: dict[str, str] = {}
        if user_input is not None:
            client = CharterisApiClient(
                base_url=user_input[CONF_BASE_URL],
                api_token=user_input[CONF_API_TOKEN],
                session=async_get_clientsession(self.hass),
            )
            try:
                self._available_lists = await client.async_validate()
            except CharterisApiError:
                errors["base"] = "cannot_connect"
            else:
                self._base_url = user_input[CONF_BASE_URL]
                self._api_token = user_input[CONF_API_TOKEN]
                return await self.async_step_lists()

        schema = vol.Schema(
            {
                vol.Required(CONF_BASE_URL, default=self._base_url): str,
                vol.Required(CONF_API_TOKEN, default=self._api_token): str,
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)

    async def async_step_lists(self, user_input: dict[str, Any] | None = None):
        options = {
            item["_id"]: item["name"]
            for item in self._available_lists
            if not item.get("archived", False)
        }

        if user_input is not None:
            return self.async_create_entry(
                title=self._base_url,
                data={
                    CONF_BASE_URL: self._base_url,
                    CONF_API_TOKEN: self._api_token,
                },
                options={CONF_LIST_IDS: user_input[CONF_LIST_IDS]},
            )

        schema = vol.Schema(
            {
                vol.Required(CONF_LIST_IDS, default=list(options.keys())): cv.multi_select(options),
            }
        )
        return self.async_show_form(step_id="lists", data_schema=schema)

    @staticmethod
    def async_get_options_flow(config_entry: config_entries.ConfigEntry):
        return CharterisOptionsFlow(config_entry)


class CharterisOptionsFlow(config_entries.OptionsFlow):
    """Handle Charteris options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        client = CharterisApiClient(
            base_url=self._config_entry.data[CONF_BASE_URL],
            api_token=self._config_entry.data[CONF_API_TOKEN],
            session=async_get_clientsession(self.hass),
        )
        available_lists = await client.async_get_lists()
        options = {
            item["_id"]: item["name"]
            for item in available_lists
            if not item.get("archived", False)
        }

        if user_input is not None:
            return self.async_create_entry(title="", data={CONF_LIST_IDS: user_input[CONF_LIST_IDS]})

        schema = vol.Schema(
            {
                vol.Required(
                    CONF_LIST_IDS,
                    default=self._config_entry.options.get(CONF_LIST_IDS, list(options.keys())),
                ): cv.multi_select(options),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
