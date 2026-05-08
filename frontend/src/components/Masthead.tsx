/**
 * Top bar — app name on the left, rail toggles + status pill + theme
 * placeholder on the right. 48px tall, hairline border below.
 */

import { Moon, PanelLeft, PanelRight } from "lucide-react";

import { useHealth } from "@/contexts/useHealth";
import { useLayout } from "@/contexts/useLayout";

import { Badge } from "./Badge";
import { IconButton } from "./IconButton";
import { Spinner } from "./Spinner";

export function Masthead() {
  const { leftRailOpen, rightRailOpen, toggleLeftRail, toggleRightRail } = useLayout();
  const { health, loading, error } = useHealth();

  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between border-b border-rule bg-bg px-4">
      <div className="flex items-center gap-3">
        <IconButton
          aria-label={leftRailOpen ? "Hide sessions panel" : "Show sessions panel"}
          aria-pressed={leftRailOpen}
          onClick={toggleLeftRail}
        >
          <PanelLeft size={16} aria-hidden="true" />
        </IconButton>
        <span className="font-display text-16 font-semibold text-ink">Lisa-Sentinel</span>
      </div>

      <div className="flex items-center gap-3">
        {loading ? (
          <Spinner label="Loading health" />
        ) : error ? (
          <Badge variant="error">backend unreachable</Badge>
        ) : health ? (
          <Badge variant={health.env_missing.length === 0 ? "success" : "warn"}>
            {health.env_missing.length === 0 ? "ready" : `${health.env_missing.length} env missing`}
          </Badge>
        ) : null}
        <IconButton aria-label="Theme (placeholder)" disabled>
          <Moon size={16} aria-hidden="true" />
        </IconButton>
        <IconButton
          aria-label={rightRailOpen ? "Hide dev panel" : "Show dev panel"}
          aria-pressed={rightRailOpen}
          onClick={toggleRightRail}
        >
          <PanelRight size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  );
}
