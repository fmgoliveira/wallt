import { createContext } from "react";

/**
 * True when the shell's status row already sits below the system status bar, so a page must not add the top safe-area
 * inset again (that would double the gap, and without the row the page itself has to clear the status bar).
 */
export const TopInsetConsumed = createContext(false);
