import { useWindowDimensions } from "react-native";
import { breakpoints } from "../tokens";

export type Breakpoint = "phone" | "tablet" | "desktop";

/** Plan §9.2: phone < 640, tablet 640-1023, desktop >= 1024. */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= breakpoints.desktop) return "desktop";
  if (width >= breakpoints.tablet) return "tablet";
  return "phone";
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return breakpointForWidth(width);
}
