import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useIdleStore } from "@/store/idleStore";
import { useReportStore } from "@/store/reportStore";
import { useAuthStore } from "@/store/authStore";
import { reportsApi } from "@/lib/api";

const IDLE_TIMEOUT = 30 * 60 * 1000;   // 30 min
const WARNING_BEFORE = 2 * 60 * 1000;  // show warning 2 min before logout
const THROTTLE_MS = 1000;

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
];

export function useIdleTimeout() {
  const router = useRouter();
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const performLogout = useCallback(async () => {
    const { dismissWarning } = useIdleStore.getState();
    dismissWarning();

    // Auto-save draft if there's a current BORRADOR report with text
    const { currentReport } = useReportStore.getState();
    let saved = false;
    if (
      currentReport &&
      currentReport.status === "BORRADOR" &&
      currentReport.texto_final?.trim()
    ) {
      try {
        await reportsApi.update(currentReport.id, {
          texto_final: currentReport.texto_final,
        });
        saved = true;
      } catch {
        // Save failed — flag it so login page shows appropriate message
      }
    }

    // Set flags for login page toast
    localStorage.setItem("idle_logout", "1");
    if (currentReport && currentReport.status === "BORRADOR" && currentReport.texto_final?.trim()) {
      localStorage.setItem("idle_logout_saved", saved ? "ok" : "fail");
    }

    // Perform actual logout
    await useAuthStore.getState().logout();
    router.replace("/login");
  }, [router]);

  const startTimers = useCallback(() => {
    clearTimers();

    warningTimerRef.current = setTimeout(() => {
      useIdleStore.getState().showWarning();
    }, IDLE_TIMEOUT - WARNING_BEFORE);

    logoutTimerRef.current = setTimeout(() => {
      performLogout();
    }, IDLE_TIMEOUT);
  }, [clearTimers, performLogout]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    useIdleStore.getState().dismissWarning();
    startTimers();
  }, [startTimers]);

  useEffect(() => {
    // Subscribe to idleStore: when countdown reaches 0, trigger logout
    const unsub = useIdleStore.subscribe((state) => {
      if (state.isWarningVisible && state.secondsRemaining <= 0) {
        performLogout();
      }
    });

    return unsub;
  }, [performLogout]);

  useEffect(() => {
    startTimers();

    // Throttled activity handler
    let throttled = false;
    const handleActivity = () => {
      if (throttled) return;
      throttled = true;
      setTimeout(() => { throttled = false; }, THROTTLE_MS);

      // Only reset if warning is NOT visible (don't reset during countdown)
      if (!useIdleStore.getState().isWarningVisible) {
        resetTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [startTimers, resetTimer, clearTimers]);

  return { resetTimer };
}
