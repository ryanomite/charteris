import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

clientsClaim()
self.skipWaiting()

precacheAndRoute(self.__WB_MANIFEST)
