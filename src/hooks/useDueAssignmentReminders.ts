import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  registerMessagingServiceWorker,
  requestFcmDeviceToken,
  subscribeForegroundFcmMessages,
  syncFcmTokenToFirestore,
} from '../lib/firebase';
import { Assignment } from '../types';

export type DueUrgency = 'overdue' | 'today' | 'within_24h' | 'fcm';

export interface DueReminderAlert {
  id: string;
  assignmentId: string;
  title: string;
  subject: string;
  dueDate: string;
  urgency: DueUrgency;
  headline: string;
  message: string;
}

export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

interface StoredNotificationRecord {
  notifiedInApp: boolean;
  notifiedBrowser: boolean;
  updatedAt: number;
}

type StoredNotificationMap = Record<string, StoredNotificationRecord>;

const ENABLED_STORAGE_KEY = 'studypilot_due_reminders_enabled_v1';
const NOTIFIED_STORAGE_PREFIX = 'studypilot_due_notified_v1';
const FCM_TOKEN_STORAGE_PREFIX = 'studypilot_fcm_token_v1';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const STALE_RECORD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function formatLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatReadableDueDate(rawDueDate: string): string {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDueDate.trim());
  if (dateOnlyMatch) {
    const dt = new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3]),
      12,
      0,
      0,
      0
    );
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  const parsed = new Date(rawDueDate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return rawDueDate;
}

export function classifyAssignmentDueUrgency(
  assignment: Assignment,
  now: Date = new Date()
): { urgency: Exclude<DueUrgency, 'fcm'>; headline: string; message: string } | null {
  if (!assignment.dueDate || assignment.status === 'Completed') {
    return null;
  }

  const trimmed = assignment.dueDate.trim();
  const todayKey = formatLocalDateKey(now);
  const readableDate = formatReadableDueDate(trimmed);
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const dueStart = new Date(year, month - 1, day, 0, 0, 0, 0);
    const dueEnd = new Date(year, month - 1, day, 23, 59, 59, 999);

    if (now.getTime() > dueEnd.getTime()) {
      return {
        urgency: 'overdue',
        headline: `Overdue: ${assignment.title}`,
        message: `${assignment.subject} passed its due date (${readableDate}).`,
      };
    }

    if (trimmed === todayKey) {
      return {
        urgency: 'today',
        headline: `Due Today: ${assignment.title}`,
        message: `${assignment.subject} is due today (${readableDate}).`,
      };
    }

    const msUntilStart = dueStart.getTime() - now.getTime();
    if (msUntilStart >= 0 && msUntilStart <= 24 * 60 * 60 * 1000) {
      return {
        urgency: 'within_24h',
        headline: `Due Within 24 Hours: ${assignment.title}`,
        message: `${assignment.subject} is due tomorrow (${readableDate}).`,
      };
    }

    return null;
  }

  // Fallback for ISO datetime strings containing explicit time
  const exactDue = new Date(trimmed);
  if (Number.isNaN(exactDue.getTime())) {
    return null;
  }

  const diffMs = exactDue.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {
      urgency: 'overdue',
      headline: `Due Time Reached: ${assignment.title}`,
      message: `${assignment.subject} reached its deadline (${readableDate}).`,
    };
  }

  if (formatLocalDateKey(exactDue) === todayKey) {
    return {
      urgency: 'today',
      headline: `Due Today: ${assignment.title}`,
      message: `${assignment.subject} is due today at ${exactDue.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}.`,
    };
  }

  if (diffMs <= 24 * 60 * 60 * 1000) {
    return {
      urgency: 'within_24h',
      headline: `Due Within 24 Hours: ${assignment.title}`,
      message: `${assignment.subject} is due in under 24 hours (${readableDate}).`,
    };
  }

  return null;
}

function getNotifiedStorageKey(userId: string | null): string {
  return `${NOTIFIED_STORAGE_PREFIX}_${userId || 'local'}`;
}

function getStoredFcmToken(userId: string | null): string | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    return window.localStorage.getItem(`${FCM_TOKEN_STORAGE_PREFIX}_${userId}`);
  } catch {
    return null;
  }
}

function saveStoredFcmToken(userId: string | null, token: string | null): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const key = `${FCM_TOKEN_STORAGE_PREFIX}_${userId}`;
    if (token) {
      window.localStorage.setItem(key, token);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage errors
  }
}

function readNotifiedMap(userId: string | null): StoredNotificationMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getNotifiedStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    const now = Date.now();
    const cleaned: StoredNotificationMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === 'object' &&
        typeof (v as StoredNotificationRecord).updatedAt === 'number' &&
        now - (v as StoredNotificationRecord).updatedAt <= STALE_RECORD_MAX_AGE_MS
      ) {
        cleaned[k] = {
          notifiedInApp: Boolean((v as StoredNotificationRecord).notifiedInApp),
          notifiedBrowser: Boolean((v as StoredNotificationRecord).notifiedBrowser),
          updatedAt: (v as StoredNotificationRecord).updatedAt,
        };
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function writeNotifiedMap(userId: string | null, map: StoredNotificationMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getNotifiedStorageKey(userId), JSON.stringify(map));
  } catch {
    // Ignore storage quota/access errors
  }
}

function getBrowserPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function readInitialEnabled(permission: BrowserNotificationPermission): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(ENABLED_STORAGE_KEY);
    if (stored === 'false') return false;
    if (stored === 'true') return true;
    return permission === 'granted' || permission === 'default';
  } catch {
    return true;
  }
}

export function useDueAssignmentReminders(
  userId: string | null,
  assignments: Assignment[],
  onOpenAssignments?: () => void
) {
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>(() => getBrowserPermission());
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() =>
    readInitialEnabled(getBrowserPermission())
  );
  const [fcmToken, setFcmToken] = useState<string | null>(() => getStoredFcmToken(userId));
  const [pushRequesting, setPushRequesting] = useState(false);
  const [reminderAlerts, setReminderAlerts] = useState<DueReminderAlert[]>([]);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const assignmentsRef = useRef(assignments);
  assignmentsRef.current = assignments;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const onOpenAssignmentsRef = useRef(onOpenAssignments);
  onOpenAssignmentsRef.current = onOpenAssignments;

  const lastSyncedSignatureRef = useRef<string>('');

  const incompleteSignature = useMemo(() => {
    return assignments
      .filter((a) => a.status !== 'Completed' && Boolean(a.dueDate))
      .map((a) => `${a.id}:${a.dueDate}:${a.title}:${a.subject}:${a.status}`)
      .join('|');
  }, [assignments]);

  const dismissReminderAlert = useCallback((alertId: string) => {
    setReminderAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const clearStatusFeedback = useCallback(() => {
    setStatusFeedback(null);
  }, []);

  const runReminderCheck = useCallback(
    (overrideEnabled?: boolean, overridePermission?: BrowserNotificationPermission) => {
      const activeEnabled = overrideEnabled ?? remindersEnabled;
      if (!activeEnabled) return 0;

      const currentUserId = userIdRef.current;
      const currentAssignments = assignmentsRef.current;
      if (!currentUserId || currentAssignments.length === 0) return 0;

      const permission = overridePermission ?? getBrowserPermission();
      const canUseBrowserNotification = permission === 'granted' && typeof Notification !== 'undefined';

      const now = new Date();
      const todayKey = formatLocalDateKey(now);
      const notifiedMap = readNotifiedMap(currentUserId);
      let mapChanged = false;
      const newlyTriggeredAlerts: DueReminderAlert[] = [];

      for (const assignment of currentAssignments) {
        const classification = classifyAssignmentDueUrgency(assignment, now);
        if (!classification) continue;

        const entryKey = `${assignment.id}::${assignment.dueDate}::${todayKey}`;
        const existingRecord = notifiedMap[entryKey] || {
          notifiedInApp: false,
          notifiedBrowser: false,
          updatedAt: now.getTime(),
        };

        const shouldSendInApp = !existingRecord.notifiedInApp;
        let shouldSendBrowser = canUseBrowserNotification && !existingRecord.notifiedBrowser;

        if (!shouldSendInApp && !shouldSendBrowser) {
          continue;
        }

        if (shouldSendBrowser) {
          try {
            const browserNotice = new Notification(classification.headline, {
              body: classification.message,
              tag: entryKey,
            });
            browserNotice.onclick = () => {
              window.focus();
              onOpenAssignmentsRef.current?.();
              browserNotice.close();
            };
            existingRecord.notifiedBrowser = true;
            existingRecord.updatedAt = now.getTime();
            mapChanged = true;
          } catch {
            shouldSendBrowser = false;
          }
        }

        if (shouldSendInApp) {
          existingRecord.notifiedInApp = true;
          existingRecord.updatedAt = now.getTime();
          mapChanged = true;

          newlyTriggeredAlerts.push({
            id: `${entryKey}_${now.getTime()}`,
            assignmentId: assignment.id,
            title: assignment.title,
            subject: assignment.subject,
            dueDate: assignment.dueDate,
            urgency: classification.urgency,
            headline: classification.headline,
            message: classification.message,
          });
        }

        notifiedMap[entryKey] = existingRecord;
      }

      if (mapChanged) {
        writeNotifiedMap(currentUserId, notifiedMap);
      }

      if (newlyTriggeredAlerts.length > 0) {
        setReminderAlerts((prev) => {
          const existingAssignmentIds = new Set(prev.map((a) => a.assignmentId));
          const uniqueNew = newlyTriggeredAlerts.filter(
            (a) => !existingAssignmentIds.has(a.assignmentId)
          );
          return [...uniqueNew, ...prev].slice(0, 4);
        });
      }

      return newlyTriggeredAlerts.length;
    },
    [remindersEnabled]
  );

  // Restore user-scoped cached FCM token & clear alerts on auth transitions
  useEffect(() => {
    lastSyncedSignatureRef.current = '';
    setFcmToken(getStoredFcmToken(userId));
    if (!userId) {
      setReminderAlerts([]);
    }
  }, [userId]);

  // Sync browser permission and register service worker / refresh FCM token silently when already granted
  useEffect(() => {
    const perm = getBrowserPermission();
    setNotificationPermission(perm);

    if (!userId || !remindersEnabled || perm !== 'granted') return;

    let cancelled = false;
    void (async () => {
      try {
        await registerMessagingServiceWorker();
        const result = await requestFcmDeviceToken();
        if (!cancelled && result.token) {
          setFcmToken(result.token);
          saveStoredFcmToken(userId, result.token);
        }
      } catch {
        // Silent background refresh fallback; local reminders still run
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, remindersEnabled]);

  // Subscribe to foreground FCM messages (onMessage) while app tab is open
  useEffect(() => {
    if (!userId || !remindersEnabled || notificationPermission !== 'granted') return;

    let unsub: (() => void) | undefined;
    let active = true;

    void subscribeForegroundFcmMessages((payload) => {
      if (!active) return;
      const title =
        payload.notification?.title ||
        payload.data?.title ||
        'StudyPilot Assignment Reminder';
      const rawBody = payload.notification?.body || payload.data?.body || '';
      const dueDate = payload.data?.dueDate || '';
      const subject = payload.data?.subject || 'Coursework';
      const assignmentId = payload.data?.assignmentId || `fcm_${Date.now()}`;
      const body =
        rawBody ||
        (dueDate ? `${subject} deadline (${dueDate}).` : 'You have an assignment reminder.');

      const alert: DueReminderAlert = {
        id: `fcm_${assignmentId}_${Date.now()}`,
        assignmentId,
        title,
        subject,
        dueDate,
        urgency: 'fcm',
        headline: title,
        message: body,
      };

      setReminderAlerts((prev) => [alert, ...prev].slice(0, 4));
    }).then((unsubscribe) => {
      if (active) {
        unsub = unsubscribe;
      } else {
        unsubscribe();
      }
    });

    return () => {
      active = false;
      unsub?.();
    };
  }, [userId, remindersEnabled, notificationPermission]);

  // Sync FCM token + userId + active incomplete assignments' dueDates into Firestore fcmTokens collection
  useEffect(() => {
    if (!userId || !fcmToken || !remindersEnabled) return;

    const syncSignature = `${userId}::${fcmToken}::${incompleteSignature}`;
    if (lastSyncedSignatureRef.current === syncSignature) return;

    let cancelled = false;
    void syncFcmTokenToFirestore({
      userId,
      token: fcmToken,
      assignments: assignmentsRef.current,
    })
      .then(() => {
        if (!cancelled) {
          lastSyncedSignatureRef.current = syncSignature;
        }
      })
      .catch(() => {
        // Ignore transient sync error; next update retries
      });

    return () => {
      cancelled = true;
    };
  }, [userId, fcmToken, remindersEnabled, incompleteSignature]);

  // Run local deadline checker on load / assignment updates and every 5 minutes
  useEffect(() => {
    if (!userId || !remindersEnabled) return;

    runReminderCheck();

    const intervalId = window.setInterval(() => {
      const perm = getBrowserPermission();
      setNotificationPermission(perm);
      runReminderCheck(remindersEnabled, perm);
    }, CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [userId, assignments, remindersEnabled, notificationPermission, runReminderCheck]);

  useEffect(() => {
    if (!statusFeedback) return;
    const timer = window.setTimeout(() => setStatusFeedback(null), 6000);
    return () => window.clearTimeout(timer);
  }, [statusFeedback]);

  const enableOrToggleReminders = useCallback(async () => {
    if (pushRequesting) return;
    const currentPermission = getBrowserPermission();
    setNotificationPermission(currentPermission);

    const hasVapidKey = Boolean(
      typeof import.meta.env.VITE_FIREBASE_VAPID_KEY === 'string' &&
        import.meta.env.VITE_FIREBASE_VAPID_KEY.trim()
    );
    const needsRegistration =
      !remindersEnabled ||
      currentPermission === 'default' ||
      (currentPermission === 'granted' && hasVapidKey && !fcmToken);

    // Case 1: Enable push notifications & request permission + register /firebase-messaging-sw.js + FCM token
    if (needsRegistration) {
      setPushRequesting(true);
      try {
        let nextPermission = currentPermission;

        if (typeof window !== 'undefined' && 'Notification' in window && currentPermission === 'default') {
          try {
            nextPermission = await Notification.requestPermission();
          } catch {
            nextPermission = getBrowserPermission();
          }
          setNotificationPermission(nextPermission);
        }

        try {
          window.localStorage.setItem(ENABLED_STORAGE_KEY, 'true');
        } catch {
          // Ignore storage error
        }
        setRemindersEnabled(true);

        let tokenSaved = Boolean(fcmToken);
        let tokenIssueReason: string | undefined;
        let tokenIssueMessage: string | undefined;

        if (nextPermission === 'granted') {
          await registerMessagingServiceWorker().catch(() => null);
          const tokenResult = await requestFcmDeviceToken();

          if (tokenResult.token && userIdRef.current) {
            setFcmToken(tokenResult.token);
            saveStoredFcmToken(userIdRef.current, tokenResult.token);
            await syncFcmTokenToFirestore({
              userId: userIdRef.current,
              token: tokenResult.token,
              assignments: assignmentsRef.current,
            }).catch(() => undefined);
            lastSyncedSignatureRef.current = `${userIdRef.current}::${tokenResult.token}::${incompleteSignature}`;
            tokenSaved = true;
          } else {
            tokenIssueReason = tokenResult.reason;
            tokenIssueMessage = tokenResult.errorMessage;
          }
        }

        const triggeredCount = runReminderCheck(true, nextPermission);

        if (nextPermission === 'denied') {
          setStatusFeedback(
            'Browser notifications are blocked in your browser settings. In-app due reminders remain active.'
          );
        } else if (nextPermission === 'unsupported') {
          setStatusFeedback('Browser push is unavailable here. In-app due reminders are active.');
        } else if (nextPermission === 'granted' && tokenSaved) {
          setStatusFeedback(
            'Background push notifications enabled! Your device token and active deadlines are synced.'
          );
        } else if (nextPermission === 'granted' && tokenIssueReason === 'missing-vapid-key') {
          setStatusFeedback(
            tokenIssueMessage ||
              'Browser reminders enabled. Add VITE_FIREBASE_VAPID_KEY to enable background FCM device tokens.'
          );
        } else if (nextPermission === 'granted' && tokenIssueMessage) {
          setStatusFeedback(
            `Browser due reminders enabled (${tokenIssueMessage}).`
          );
        } else if (nextPermission === 'granted' && triggeredCount === 0) {
          setStatusFeedback(
            'Push notifications enabled. You will be alerted for due and overdue assignments.'
          );
        } else if (nextPermission === 'default') {
          setStatusFeedback(
            'In-app due reminders enabled. Allow browser notifications to receive desktop & background alerts.'
          );
        }
      } finally {
        setPushRequesting(false);
      }
      return;
    }

    // Case 2: Already enabled with token (or granted) -> pause reminders cleanly
    try {
      window.localStorage.setItem(ENABLED_STORAGE_KEY, 'false');
    } catch {
      // Ignore storage error
    }
    setRemindersEnabled(false);
    setReminderAlerts([]);
    setStatusFeedback('Due-date notifications paused.');
  }, [fcmToken, incompleteSignature, pushRequesting, remindersEnabled, runReminderCheck]);

  return {
    remindersEnabled,
    notificationPermission,
    fcmToken,
    pushRequesting,
    reminderAlerts,
    statusFeedback,
    dismissReminderAlert,
    clearStatusFeedback,
    enableOrToggleReminders,
    runReminderCheck,
  };
}
