/**
 * Root component — wires the context providers around the shell.
 *
 * Provider order matters: SessionContext is depended on by
 * WorkspaceContext (for bookmark id generation) and by every component
 * that pushes toasts; HealthContext feeds the parser dropdown;
 * DevPromptsContext is consulted by both the right-rail panel and the
 * mode workspaces.
 */

import { AppShell } from "@/components/AppShell";
import { DevPromptsProvider } from "@/contexts/DevPromptsContext";
import { HealthProvider } from "@/contexts/HealthContext";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";

export function App() {
  return (
    <LayoutProvider>
      <SessionProvider>
        <HealthProvider>
          <WorkspaceProvider>
            <DevPromptsProvider>
              <AppShell />
            </DevPromptsProvider>
          </WorkspaceProvider>
        </HealthProvider>
      </SessionProvider>
    </LayoutProvider>
  );
}
