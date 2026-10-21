import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { tabbableControls } from "../components/focus";

export function useNavigationDrawer(open: boolean, close: () => void) {
  const drawer = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const active = mobile && open;
  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const changed = () => setMobile(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!active) return;
    const element = drawer.current;
    const button = trigger.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      if (
        button?.isConnected &&
        (element?.contains(document.activeElement) ||
          document.activeElement === document.body)
      )
        button.focus({ preventScroll: true });
    };
  }, [active]);
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!active || event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = tabbableControls(event.currentTarget);
    const first = controls[0],
      last = controls.at(-1),
      focused = document.activeElement;
    if (
      event.shiftKey &&
      (focused === first || focused === event.currentTarget)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (focused === last || focused === event.currentTarget)
    ) {
      event.preventDefault();
      first?.focus();
    }
  }
  return { drawer, trigger, mobile, active, onKeyDown };
}
