import { useEffect, useRef } from "react";

export function useMobileCombobox(isOpen: boolean) {
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

      // Handle window resize (keyboard show/hide)
      const handleResize = () => {
        if (contentRef.current) {
          const rect = contentRef.current.getBoundingClientRect();
          const isKeyboardVisible = window.innerHeight < window.outerHeight;
          const viewportHeight = window.innerHeight;
          const availableHeight = viewportHeight - rect.top;

          if (isKeyboardVisible) {
            // Calculate the maximum height that fits above the keyboard
            const maxHeight = Math.min(availableHeight, viewportHeight * 0.6);

            // Position the combobox above the keyboard
            contentRef.current.style.position = "fixed";
            contentRef.current.style.bottom = `${viewportHeight - rect.top}px`;
            contentRef.current.style.left = `${rect.left}px`;
            contentRef.current.style.width = `${rect.width}px`;
            contentRef.current.style.maxHeight = `${maxHeight}px`;
            contentRef.current.style.transform = "translateY(-100%)";
          } else {
            // Reset position when keyboard is hidden
            contentRef.current.style.position = "";
            contentRef.current.style.bottom = "";
            contentRef.current.style.left = "";
            contentRef.current.style.width = "";
            contentRef.current.style.maxHeight = "";
            contentRef.current.style.transform = "";
          }
        }
      };

      // Initial check for keyboard visibility
      handleResize();

      document.addEventListener("focusin", handleFocusIn);
      window.addEventListener("resize", handleResize);

      return () => {
        document.removeEventListener("focusin", handleFocusIn);
        window.removeEventListener("resize", handleResize);
      };
    }
  }, [isOpen]);

  return {
    contentRef,
    inputRef,
  };
}
