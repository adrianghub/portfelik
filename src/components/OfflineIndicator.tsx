import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      console.log("Network", "Connection restored");
    };

    const handleOffline = () => {
      setIsOffline(true);
      console.log("Network", "Connection lost");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="fixed top-4 left-4 bg-background text-foreground px-3 py-1 rounded-md text-sm opacity-75 z-50"
      style={{
        backdropFilter: "blur(4px)",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      Offline
    </div>
  );
}
