"use client";

import { useEffect, useState } from "react";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(ios);

    // Detect Standalone (PWA installata)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as unknown as { standalone: boolean }).standalone));
    setIsStandalone(standalone);

    // Check Web Push support
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotification = "Notification" in window;

    if (!hasSW || !hasPush || !hasNotification) {
      setSupported(false);
      return;
    }

    setSupported(true);
    setPermission(Notification.permission);

    // Check if subscription exists
    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(Boolean(sub));
      });
    });
  }, []);

  async function handleSubscribe() {
    setLoading(true);
    setStatusMessage(null);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setStatusMessage("Permesso notifiche negato.");
        setLoading(false);
        return;
      }

      // 2. Wait for Service Worker registration
      const registration = await navigator.serviceWorker.ready;

      // 3. Subscribe with VAPID key
      const convertedKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      // 4. Send subscription to our backend
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        throw new Error("Errore durante il salvataggio della sottoscrizione");
      }

      setIsSubscribed(true);
      setStatusMessage("Notifiche push attivate con successo! 🎉");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Impossibile attivare le notifiche");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsubscribe() {
    setLoading(true);
    setStatusMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      setStatusMessage("Notifiche push disattivate.");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Errore durante la disattivazione");
    } finally {
      setLoading(false);
    }
  }

  if (supported === false) {
    return (
      <div className="mt-4 rounded-xl border border-border/60 bg-surface p-4 text-sm text-muted">
        <p className="font-medium text-foreground">🔔 Notifiche non supportate</p>
        <p className="mt-1 text-xs">
          {isIOS && !isStandalone
            ? "Su iPhone devi prima aggiungere l'app alla Home Screen (Condividi → 'Aggiungi a schermata Home') per ricevere notifiche push."
            : "Questo browser non supporta le notifiche Web Push."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">🔔</span>
          <div>
            <p className="font-medium">Notifiche Push</p>
            <p className="text-xs text-muted">
              {isSubscribed ? "Attive su questo dispositivo" : "Ricevi aggiornamenti sulle spese"}
            </p>
          </div>
        </div>

        {isSubscribed ? (
          <button
            onClick={handleUnsubscribe}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted active:bg-surface-elevated disabled:opacity-50"
          >
            Disattiva
          </button>
        ) : (
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-black active:opacity-90 disabled:opacity-50"
          >
            {loading ? "Attivando..." : "Attiva"}
          </button>
        )}
      </div>

      {isIOS && !isStandalone && (
        <p className="mt-3 rounded-lg bg-surface-elevated p-2 text-xs text-brand">
          💡 <strong>Nota iOS:</strong> Per ricevere le notifiche su iPhone, installa l'app toccando Condividi ➔ <em>"Aggiungi a schermata Home"</em>.
        </p>
      )}

      {permission === "denied" && (
        <p className="mt-2 text-xs text-danger">
          I permessi delle notifiche sono bloccati nelle impostazioni del browser del tuo telefono.
        </p>
      )}

      {statusMessage && (
        <p className="mt-2 text-xs font-medium text-brand">{statusMessage}</p>
      )}
    </div>
  );
}

