import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastStatus = "loading" | "success" | "error";

interface ToastItem {
  id: string;
  groupId: string;
  stacked: boolean;
  title: string;
  message: string;
  status: ToastStatus;
}

interface ToastApi {
  start: (title: string, message: string) => string;
  startStack: (title: string, message: string) => string;
  update: (id: string, message: string) => void;
  succeed: (id: string, message: string) => void;
  fail: (id: string, message: string) => void;
  dismiss: (id: string) => void;
}

const fallbackApi: ToastApi = {
  start: () => "toast-unmounted",
  startStack: () => "toast-unmounted",
  update: () => undefined,
  succeed: () => undefined,
  fail: () => undefined,
  dismiss: () => undefined,
};

const ToastContext = createContext<ToastApi>(fallbackApi);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const sequence = useRef(0);
  const timers = useRef(new Map<string, number>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (groupId: string) => {
      clearTimer(groupId);
      setItems((current) =>
        current.filter((item) => item.groupId !== groupId),
      );
    },
    [clearTimer],
  );

  const startToast = useCallback(
    (title: string, message: string, stacked: boolean) => {
      sequence.current += 1;
      const id = `toast-${sequence.current}`;
      setItems((current) => [
        ...current,
        { id, groupId: id, stacked, title, message, status: "loading" },
      ]);
      return id;
    },
    [],
  );

  const start = useCallback(
    (title: string, message: string) => startToast(title, message, false),
    [startToast],
  );

  const startStack = useCallback(
    (title: string, message: string) => startToast(title, message, true),
    [startToast],
  );

  const update = useCallback(
    (groupId: string, message: string) => {
      clearTimer(groupId);
      setItems((current) => {
        const group = current.filter((item) => item.groupId === groupId);
        const latest = group.at(-1);
        if (!latest) return current;
        if (!latest.stacked) {
          return current.map((item) =>
            item.groupId === groupId
              ? { ...item, message, status: "loading" }
              : item,
          );
        }
        if (latest.message === message && latest.status === "loading") {
          return current;
        }
        sequence.current += 1;
        return [
          ...current.map((item) =>
            item.id === latest.id && item.status === "loading"
              ? { ...item, status: "success" as const }
              : item,
          ),
          {
            id: `toast-${sequence.current}`,
            groupId,
            stacked: true,
            title: latest.title,
            message,
            status: "loading",
          },
        ];
      });
    },
    [clearTimer],
  );

  const settle = useCallback(
    (groupId: string, message: string, status: "success" | "error") => {
      clearTimer(groupId);
      setItems((current) => {
        const group = current.filter((item) => item.groupId === groupId);
        const latest = group.at(-1);
        if (!latest) return current;
        return current.map((item) => {
          if (item.groupId !== groupId) return item;
          if (item.id === latest.id) return { ...item, message, status };
          return item.stacked && item.status === "loading"
            ? { ...item, status: "success" as const }
            : item;
        });
      });
      timers.current.set(
        groupId,
        window.setTimeout(
          () => dismiss(groupId),
          status === "success" ? 4_000 : 7_000,
        ),
      );
    },
    [clearTimer, dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      timers.current.clear();
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      start,
      startStack,
      update,
      succeed: (id, message) => settle(id, message, "success"),
      fail: (id, message) => settle(id, message, "error"),
      dismiss,
    }),
    [dismiss, settle, start, startStack, update],
  );

  const groups = items.reduce<ToastItem[][]>((result, item) => {
    const existing = result.find(
      (group) => group[0]?.groupId === item.groupId,
    );
    if (existing) existing.push(item);
    else result.push([item]);
    return result;
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <aside
        className="toast-viewport"
        aria-label="Transaction notifications"
      >
        {groups.map((group) => {
          const groupId = group[0]?.groupId ?? "";
          const isStacked = group[0]?.stacked ?? false;
          return (
            <div
              className={`toast-group${isStacked ? " stacked" : ""}`}
              key={groupId}
            >
              {group.map((item, index) => {
                const isLast = index === group.length - 1;
                return (
                  <section
                    className={`transaction-toast ${item.status}`}
                    key={item.id}
                    role={item.status === "error" ? "alert" : "status"}
                    aria-live={item.status === "error" ? "assertive" : "polite"}
                  >
                    <span className="toast-status-mark" aria-hidden="true">
                      {item.status === "loading"
                        ? ""
                        : item.status === "success"
                          ? "✓"
                          : "!"}
                    </span>
                    <span className="toast-copy">
                      <strong>
                        {item.title}
                        {isStacked ? ` · Step ${index + 1}` : ""}
                      </strong>
                      <span>{item.message}</span>
                    </span>
                    {isLast ? (
                      <button
                        type="button"
                        onClick={() => dismiss(groupId)}
                        aria-label={`Dismiss ${item.title} notification${
                          isStacked ? " group" : ""
                        }`}
                      >
                        ×
                      </button>
                    ) : (
                      <span className="toast-close-placeholder" aria-hidden="true" />
                    )}
                  </section>
                );
              })}
            </div>
          );
        })}
      </aside>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  return useContext(ToastContext);
}
