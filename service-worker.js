const CACHE = "mi-ciclo-v11";
const IS_LOCAL =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1";

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon-64.png"
];

/*
  En desarrollo local (Live Server) este Service Worker se elimina
  automáticamente para no interferir con otros proyectos que usen
  localhost o 127.0.0.1.
*/
if(IS_LOCAL){
  self.addEventListener("install", event => {
    self.skipWaiting();
  });

  self.addEventListener("activate", event => {
    event.waitUntil(
      Promise.all([
        caches.keys().then(keys =>
          Promise.all(
            keys
              .filter(key => key.startsWith("mi-ciclo"))
              .map(key => caches.delete(key))
          )
        ),
        self.registration.unregister()
      ])
    );
  });
}else{
  self.addEventListener("install", event => {
    event.waitUntil(
      caches.open(CACHE).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
  });

  self.addEventListener("activate", event => {
    event.waitUntil(
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("mi-ciclo") && key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
    );
    self.clients.claim();
  });

  self.addEventListener("fetch", event => {
    if(event.request.method !== "GET") return;

    const requestUrl = new URL(event.request.url);

    // Solo maneja recursos de la misma web.
    if(requestUrl.origin !== self.location.origin) return;

    // Para navegación: primero intenta internet y usa index solo si no hay conexión.
    if(event.request.mode === "navigate"){
      event.respondWith(
        fetch(event.request)
          .then(response => {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put("./index.html", copy));
            return response;
          })
          .catch(() => caches.match("./index.html"))
      );
      return;
    }

    // Archivos principales: red primero para que al reemplazar app.js
    // en GitHub Pages no se quede pegada una versión anterior.
    const isCoreFile =
      requestUrl.pathname.endsWith("/app.js") ||
      requestUrl.pathname.endsWith("/index.html") ||
      requestUrl.pathname.endsWith("/service-worker.js");

    if(isCoreFile){
      event.respondWith(
        fetch(event.request)
          .then(response => {
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(event.request,copy));
            return response;
          })
          .catch(()=>caches.match(event.request))
      );
      return;
    }

    // Resto de recursos: caché primero para conservar el uso sin internet.
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached ||
        fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
          return response;
        })
      )
    );
  });

  self.addEventListener("notificationclick", event => {
    event.notification.close();
    const target = event.notification.data?.url || "./index.html#anticonceptivo";

    event.waitUntil(
      clients.matchAll({type:"window", includeUncontrolled:true}).then(windowClients => {
        for(const client of windowClients){
          if("focus" in client){
            client.navigate(target);
            return client.focus();
          }
        }
        if(clients.openWindow) return clients.openWindow(target);
      })
    );
  });
}
