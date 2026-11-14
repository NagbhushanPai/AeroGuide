"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Switches between dark and light. Icons and the accessible name ("Switch to light theme" /
 * "Switch to dark theme") are swapped with CSS (`dark:`), so server and client markup match,
 * the name is right before JavaScript runs, and there is no hydration flash.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
    >
      <Sun aria-hidden="true" className="hidden dark:block" />
      <Moon aria-hidden="true" className="block dark:hidden" />
      <span className="sr-only">
        <span className="hidden dark:inline">Switch to light theme</span>
        <span className="dark:hidden">Switch to dark theme</span>
      </span>
    </Button>
  );
}
