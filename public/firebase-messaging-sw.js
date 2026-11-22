/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js');

const DEFAULT_SW_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAQXHWfLRGcuTCF-kHTyLvxi3x_zW5tRlE',
  authDomain: 'gen-lang-client-0612463551.firebaseapp.com',
  projectId: 'gen-lang-client-0612463551',
  storageBucket: 'gen-lang-client-0612463551.firebasestorage.app',
  messagingSenderId: '513566555333',
  appId: '1:513566555333:web:ee424d4f90999555c8c4ac',
};

function resolveSwFirebaseConfig() {
  try {
    const params = new URL(self.location.href).searchParams;
    return {
      apiKey: params.get('apiKey') || DEFAULT_SW_FIREBASE_CONFIG.apiKey,
      authDomain: params.get('authDomain') || DEFAULT_SW_FIREBASE_CONFIG.authDomain,
      projectId: params.get('projectId') || DEFAULT_SW_FIREBASE_CONFIG.projectId,
      storageBucket: params.get('storageBucket') || DEFAULT_SW_FIREBASE_CONFIG.storageBucket,
      messagingSenderId:
        params.get('messagingSenderId') || DEFAULT_SW_FIREBASE_CONFIG.messagingSenderId,
      appId: params.get('appId') || DEFAULT_SW_FIREBASE_CONFIG.appId,
    };
  } catch (_err) {
    return DEFAULT_SW_FIREBASE_CONFIG;
  }
}

if (!firebase.apps.length) {
  firebase.initializeApp(resolveSwFirebaseConfig());
}

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload && payload.notification ? payload.notification : {};
  const data = payload && payload.data ? payload.data : {};

  const title =
    notification.title ||
    data.title ||
    (data.assignmentTitle
      ? `Assignment Due Reminder: ${data.assignmentTitle}`
      : 'StudyPilot Assignment Reminder');

  const dueDateLabel = data.dueDate ? `Due: ${data.dueDate}` : '';
  const subjectLabel = data.subject ? `${data.subject}` : '';
  const fallbackDetails = [subjectLabel, dueDateLabel].filter(Boolean).join(' · ');

  let body = notification.body || data.body || '';
  if (!body) {
    body = fallbackDetails || 'You have an assignment deadline approaching in StudyPilot.';
  } else if (dueDateLabel && !body.includes(data.dueDate)) {
    body = `${body} (${dueDateLabel})`;
  }

  const targetUrl = data.url || data.click_action || '/assignments';
  const tag =
    data.tag ||
    (data.assignmentId ? `studypilot_due_${data.assignmentId}` : 'studypilot_due_reminder');

  return self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    requireInteraction: data.urgency === 'overdue' || data.urgency === 'today',
    data: {
      url: targetUrl,
      assignmentId: data.assignmentId || '',
      dueDate: data.dueDate || '',
    },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawTarget =
    (event.notification && event.notification.data && event.notification.data.url) || '/assignments';
  const resolvedUrl = new URL(rawTarget, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus().then((focusedClient) => {
              if (focusedClient && 'navigate' in focusedClient && focusedClient.url !== resolvedUrl) {
                return focusedClient.navigate(resolvedUrl);
              }
              return focusedClient;
            });
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(resolvedUrl);
        }
        return undefined;
      })
  );
});
