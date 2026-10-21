// 서비스 워커: 웹 푸시 알림 표시와 알림을 눌렀을 때 해당 화면 열기
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "TLC 교회 보고서", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "TLC 교회 보고서", {
      body: data.body || "",
      icon: "/icons/icon-192.png?v=weekly-report-1",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // 같은 사이트 안의 주소만 연다
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          try {
            const navigated = await w.navigate(target.href);
            if (navigated) return navigated.focus();
          } catch { /* 닫힌 창은 건너뛰고 새 창으로 연다. */ }
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
