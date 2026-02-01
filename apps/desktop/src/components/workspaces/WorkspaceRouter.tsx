/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Space } from '../../stores/appStore'
import IDEWorkspace from '../ide/IDEWorkspace'

interface WorkspaceRouterProps {
  space: Space
}

export default function WorkspaceRouter({ space }: WorkspaceRouterProps) {
  switch (space.category) {
    case 'programming':
      return <IDEWorkspace />
    case 'research':
      // Research workspace - canvas/notes environment
      return (
        <div className="research-workspace">
          <div className="research-placeholder">
            <h2>Research Workspace</h2>
            <p>Canvas and research tools coming soon for: {space.name}</p>
          </div>
          <style>{`
            .research-workspace {
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              background: var(--color-bg);
            }
            .research-placeholder {
              text-align: center;
              color: var(--color-text-muted);
            }
            .research-placeholder h2 {
              margin-bottom: var(--space-2);
              color: var(--color-text);
            }
          `}</style>
        </div>
      )
    default:
      return <IDEWorkspace />
  }
}
