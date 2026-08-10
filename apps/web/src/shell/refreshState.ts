export const refreshStateEvent = "flarequorum:refresh-state";

export function requestRefreshState() {
  window.dispatchEvent(new Event(refreshStateEvent));
}
