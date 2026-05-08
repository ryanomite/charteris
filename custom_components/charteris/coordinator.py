from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import CharterisApiClient, CharterisApiError
from .const import DEFAULT_SCAN_INTERVAL_SECONDS


class CharterisCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Coordinate Charteris dashboard polling."""

    def __init__(self, hass: HomeAssistant, client: CharterisApiClient) -> None:
        super().__init__(
            hass,
            logger=__import__("logging").getLogger(__name__),
            name="charteris",
            update_interval=timedelta(seconds=DEFAULT_SCAN_INTERVAL_SECONDS),
        )
        self.client = client

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            return await self.client.async_get_dashboard()
        except CharterisApiError as err:
            raise UpdateFailed(str(err)) from err
