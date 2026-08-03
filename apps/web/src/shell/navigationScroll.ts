export function scrollToPageTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({
    behavior: "auto",
    left: 0,
    top: 0,
  });
}
