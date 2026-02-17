/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import IDEWorkspace from '../ide/IDEWorkspace'
import { Space } from '../../stores/appStore'

export default function WorkspaceRouter({ space: _space }: { space?: Space | null }) {
  // Consistently return the IDE experience for all workspaces
  return <IDEWorkspace />
}
