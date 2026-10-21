export function tabbableControls(container: HTMLElement): HTMLElement[] {
  return [
    ...container.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, summary, [tabindex]",
    ),
  ].filter((control) => {
    if (
      control.tabIndex < 0 ||
      control.matches(":disabled") ||
      control.closest("[inert], [hidden]") ||
      !control.getClientRects().length ||
      getComputedStyle(control).visibility === "hidden"
    )
      return false;
    // Some native controls keep layout boxes inside collapsed details.
    for (
      let ancestor = control.parentElement;
      ancestor && ancestor !== container;
      ancestor = ancestor.parentElement
    ) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
        const summary = [...ancestor.children].find(
          (child) => child.tagName === "SUMMARY",
        );
        if (!summary?.contains(control)) return false;
      }
      if (ancestor instanceof HTMLDialogElement && ancestor !== container)
        return false;
    }
    return true;
  });
}
