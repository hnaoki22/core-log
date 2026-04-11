/**
 * Rumination Timer Utility for Tier E Feature: tier-e.ruminationTimer
 *
 * Detects when a user has been typing/idle in a text field for 3+ minutes
 * and triggers a "deep breathing" microinteraction to break rumination patterns.
 *
 * Usage (in React component):
 *   const { startMonitoring, stopMonitoring, isStalled } = useRuminationTimer(
 *     textInputRef,
 *     { stallDurationMs: 180000 } // 3 minutes
 *   );
 *
 *   useEffect(() => {
 *     startMonitoring();
 *     return () => stopMonitoring();
 *   }, []);
 *
 *   if (isStalled) {
 *     return <DeepBreathingMicroInteraction onComplete={() => setIsStalled(false)} />;
 *   }
 */

/**
 * Configuration for rumination timer
 */
export type RuminationTimerConfig = {
  stallDurationMs?: number; // How long before triggering (default: 180000ms = 3 minutes)
  debounceMs?: number; // Grace period after last input before starting timer (default: 2000ms)
  enabled?: boolean; // Whether to monitor (default: true)
};

/**
 * Detects when a text field has been idle/stalled for a configured duration
 * Returns callback functions and state to integrate into React components
 *
 * @param inputElement - Reference to the textarea or input element to monitor
 * @param config - Timer configuration
 * @returns Object with control methods and status
 */
export function useRuminationTimer(
  inputElement: HTMLTextAreaElement | HTMLInputElement | null,
  config: RuminationTimerConfig = {}
) {
  const {
    stallDurationMs = 180000, // 3 minutes
    debounceMs = 2000, // 2 second grace period after input
    enabled = true,
  } = config;

  let stallTimer: NodeJS.Timeout | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let isMonitoring = false;
  let lastInputTime = Date.now();
  let hasTriggered = false;

  // Callback list for when stall is detected
  const stallCallbacks: Array<() => void> = [];

  /**
   * Register callback to fire when 3-minute stall is detected
   */
  function onStall(callback: () => void): void {
    stallCallbacks.push(callback);
  }

  /**
   * Trigger all registered stall callbacks
   */
  function triggerStallDetection(): void {
    if (!hasTriggered && stallCallbacks.length > 0) {
      hasTriggered = true;
      stallCallbacks.forEach((cb) => cb());
    }
  }

  /**
   * Reset the stall state (call after user acknowledges the prompt)
   */
  function resetStallDetection(): void {
    hasTriggered = false;
    lastInputTime = Date.now();
    startStallTimer();
  }

  /**
   * Clear all timers
   */
  function clearAllTimers(): void {
    if (stallTimer) clearTimeout(stallTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    stallTimer = null;
    debounceTimer = null;
  }

  /**
   * Start the main stall detection timer
   */
  function startStallTimer(): void {
    clearAllTimers();
    stallTimer = setTimeout(() => {
      triggerStallDetection();
    }, stallDurationMs);
  }

  /**
   * Handle input/change events from the text field
   */
  function handleInputChange(): void {
    lastInputTime = Date.now();

    // Clear existing timers
    clearAllTimers();

    // Reset hasTriggered if user is editing
    if (hasTriggered) {
      hasTriggered = false;
    }

    // Start debounce timer: only start stall detection after user stops typing
    debounceTimer = setTimeout(() => {
      startStallTimer();
    }, debounceMs);
  }

  /**
   * Start monitoring the input element
   */
  function startMonitoring(): void {
    if (!enabled || !inputElement || isMonitoring) return;

    isMonitoring = true;
    inputElement.addEventListener("input", handleInputChange);
    inputElement.addEventListener("change", handleInputChange);

    // Initialize timers
    lastInputTime = Date.now();
    startStallTimer();
  }

  /**
   * Stop monitoring and clean up
   */
  function stopMonitoring(): void {
    if (!inputElement) return;

    isMonitoring = false;
    clearAllTimers();
    inputElement.removeEventListener("input", handleInputChange);
    inputElement.removeEventListener("change", handleInputChange);
  }

  /**
   * Get current stall status
   */
  function getStatus(): {
    isMonitoring: boolean;
    hasTriggered: boolean;
    timeIdleMs: number;
  } {
    return {
      isMonitoring,
      hasTriggered,
      timeIdleMs: Date.now() - lastInputTime,
    };
  }

  return {
    startMonitoring,
    stopMonitoring,
    onStall,
    resetStallDetection,
    getStatus,
    isTriggered: () => hasTriggered,
  };
}

/**
 * Standalone function to create a rum timer (non-React)
 * Useful for vanilla JS or when hooks can't be used
 */
export class RuminationTimerManager {
  private stallTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private lastInputTime: number = Date.now();
  private hasTriggered: boolean = false;
  private stallCallbacks: Array<() => void> = [];

  constructor(
    private inputElement: HTMLTextAreaElement | HTMLInputElement,
    private config: RuminationTimerConfig = {}
  ) {
    const { stallDurationMs = 180000, debounceMs = 2000, enabled = true } =
      this.config;
    this.config.stallDurationMs = stallDurationMs;
    this.config.debounceMs = debounceMs;
    this.config.enabled = enabled;
  }

  onStall(callback: () => void): void {
    this.stallCallbacks.push(callback);
  }

  start(): void {
    if (!this.config.enabled || this.isMonitoring) return;

    this.isMonitoring = true;
    this.inputElement.addEventListener("input", this.handleInput.bind(this));
    this.inputElement.addEventListener("change", this.handleInput.bind(this));
    this.startStallTimer();
  }

  stop(): void {
    this.isMonitoring = false;
    this.clearAllTimers();
    this.inputElement.removeEventListener(
      "input",
      this.handleInput.bind(this)
    );
    this.inputElement.removeEventListener(
      "change",
      this.handleInput.bind(this)
    );
  }

  reset(): void {
    this.hasTriggered = false;
    this.lastInputTime = Date.now();
    this.startStallTimer();
  }

  private handleInput(): void {
    this.lastInputTime = Date.now();
    this.clearAllTimers();

    if (this.hasTriggered) {
      this.hasTriggered = false;
    }

    const debounceMs = this.config.debounceMs || 2000;
    this.debounceTimer = setTimeout(() => {
      this.startStallTimer();
    }, debounceMs);
  }

  private startStallTimer(): void {
    this.clearAllTimers();
    const stallDurationMs = this.config.stallDurationMs || 180000;
    this.stallTimer = setTimeout(() => {
      this.triggerStall();
    }, stallDurationMs);
  }

  private triggerStall(): void {
    if (!this.hasTriggered && this.stallCallbacks.length > 0) {
      this.hasTriggered = true;
      this.stallCallbacks.forEach((cb) => cb());
    }
  }

  private clearAllTimers(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.stallTimer = null;
    this.debounceTimer = null;
  }

  getStatus() {
    return {
      isMonitoring: this.isMonitoring,
      hasTriggered: this.hasTriggered,
      timeIdleMs: Date.now() - this.lastInputTime,
    };
  }
}

/**
 * React Hook version using useEffect and useRef
 * More idiomatic for React components
 */
export function useRuminationTimerHook(
  inputRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement>,
  onStallDetected?: () => void,
  config: RuminationTimerConfig = {}
) {
  const managerRef = React.useRef<RuminationTimerManager | null>(null);
  const [isStalled, setIsStalled] = React.useState(false);

  React.useEffect(() => {
    if (!inputRef.current) return;

    // Create timer manager
    managerRef.current = new RuminationTimerManager(inputRef.current, config);

    // Register stall callback
    if (managerRef.current) {
      managerRef.current.onStall(() => {
        setIsStalled(true);
        onStallDetected?.();
      });

      // Start monitoring
      managerRef.current.start();
    }

    // Cleanup
    return () => {
      if (managerRef.current) {
        managerRef.current.stop();
      }
    };
  }, [inputRef, onStallDetected, config]);

  return {
    isStalled,
    resetStall: () => {
      setIsStalled(false);
      managerRef.current?.reset();
    },
    getStatus: () => managerRef.current?.getStatus(),
  };
}

// Import React for the hook version
import React from "react";

/**
 * Helper: Deep breathing microinteraction UI
 * Can be used in components that detect rumination
 */
export const DeepBreathingPrompt = ({
  onDismiss,
  visible = true,
}: {
  onDismiss?: () => void;
  visible?: boolean;
}) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        backgroundColor: "#fff3e0",
        border: "2px solid #ff9800",
        borderRadius: "8px",
        padding: "16px",
        maxWidth: "300px",
        boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
        zIndex: 1000,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: "14px", marginBottom: "12px" }}>
        <strong>深呼吸しましょう 🫁</strong>
        <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#666" }}>
          同じフィールドに3分以上停滞しています。一度立ち上がって深呼吸をして、リセットしましょう。
        </p>
      </div>
      <button
        onClick={onDismiss}
        style={{
          backgroundColor: "#ff9800",
          color: "white",
          border: "none",
          borderRadius: "4px",
          padding: "8px 12px",
          cursor: "pointer",
          fontSize: "12px",
          width: "100%",
        }}
      >
        了解
      </button>
    </div>
  );
};
