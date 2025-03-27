import { useEffect, useRef } from "react";

export function useMobileDialog(isOpen: boolean) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Handle focus and scrolling to ensure the active element is visible
      const handleFocusIn = () => {
        // Allow a brief moment for the virtual keyboard to appear
        setTimeout(() => {
          // Ensure the active element is visible by scrolling it into view
          const activeElement = document.activeElement;
          if (activeElement && activeElement instanceof HTMLElement) {
            activeElement.scrollIntoView({
              block: "center",
              behavior: "smooth",
            });
          }
        }, 100);
      };

      document.addEventListener("focusin", handleFocusIn);
      return () => {
        document.removeEventListener("focusin", handleFocusIn);
      };
    }
  }, [isOpen]);

  const scrollToBottom = () => {
    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
    }, 100);
  };

  return {
    contentRef,
    scrollToBottom,
  };
}
