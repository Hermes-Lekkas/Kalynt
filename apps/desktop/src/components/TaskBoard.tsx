/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { useYDoc, useYArray } from '../hooks/useYjs'
import { offlineLLMService, type ChatMessage } from '../services/offlineLLMService'
import { useModelStore } from '../stores/modelStore'
import UnifiedSettingsPanel from './UnifiedSettingsPanel'
import { Plus, X, Sparkles, CheckCircle2, Clock, Trash2, Save } from 'lucide-react'

interface Task {
  id: string
  title: string
  description?: string
  status: 'todo' | 'in-progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  tags: string[]
  createdAt: number
  dueDate?: number
  subtasks?: { id: string; title: string; completed: boolean }[]
}

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'var(--color-text-tertiary)' },
  { id: 'in-progress', title: 'In Progress', color: 'var(--color-accent)' },
  { id: 'done', title: 'Done', color: 'var(--color-success)' },
] as const

export default function TaskBoard() {
  const { currentSpace } = useAppStore()
  const { doc, peerCount } = useYDoc(currentSpace?.id ?? null)
  const { items: tasks, push, update, remove } = useYArray<Task>(doc, 'tasks')
  const { loadedModelId } = useModelStore()

  const [draggingTask, setDraggingTask] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)

  // Drag & Drop
  const handleDragStart = (taskId: string) => setDraggingTask(taskId)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  const handleDrop = useCallback((status: Task['status']) => {
    if (!draggingTask) return
    const taskIndex = tasks.findIndex(t => t.id === draggingTask)
    if (taskIndex !== -1) {
      const task = tasks[taskIndex]
      if (task.status !== status) {
        update(taskIndex, { ...task, status })
      }
    }
    setDraggingTask(null)
  }, [draggingTask, tasks, update])

  // CRUD
  const handleAddTask = (status: Task['status'] = 'todo') => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: 'New Task',
      status,
      priority: 'medium',
      tags: [],
      createdAt: Date.now(),
      subtasks: []
    }
    push(newTask)
    setEditingTask(newTask)
  }

  const handleDeleteTask = (taskId: string) => {
    const index = tasks.findIndex(t => t.id === taskId)
    if (index !== -1) remove(index)
    if (editingTask?.id === taskId) setEditingTask(null)
  }

  const handleSaveTask = (updatedTask: Task) => {
    const index = tasks.findIndex(t => t.id === updatedTask.id)
    if (index !== -1) {
      update(index, updatedTask)
    }
    setEditingTask(null)
  }

  // AI Helper - Now uses offline models
  // Returns the generated subtasks so modal can update its local state
  const handleAiBreakdown = async (task: Task): Promise<{ id: string; title: string; completed: boolean }[]> => {
    // Check if a model is loaded
    if (!loadedModelId) {
      // Prompt user to select a model
      setShowModelSelector(true)
      return []
    }

    setIsAiLoading(true)
    try {
      const prompt = `Break down this task into 3-5 actionable subtasks: "${task.title}". 
${task.description ? `Context: ${task.description}` : ''}

Return ONLY a JSON array of strings, for example:
["First subtask", "Second subtask", "Third subtask"]

Do not include any other text.`

      const history: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful task planning assistant. Respond only with the requested JSON array.' },
        { role: 'user', content: prompt }
      ]

      let fullResponse = ''
      await offlineLLMService.generateStream(history, (token) => {
        fullResponse += token
      }, { jsonSchema: undefined })

      console.log('[TaskBoard] AI Response:', fullResponse)

      // Parse JSON from response
      let subtasks: string[] = []

      try {
        // Try to find JSON array in response
        const jsonMatch = fullResponse.match(/\[[\s\S]*?\]/)
        if (jsonMatch) {
          subtasks = JSON.parse(jsonMatch[0])
        }
      } catch {
        // Fallback: split by newlines
        subtasks = fullResponse
          .split('\n')
          .filter(l => l.trim().length > 0)
          .map(l => l.replace(/^[-*â€¢]\s*/, '').replace(/^\d+\.\s*/, '').trim())
          .filter(l => l.length > 0)
          .slice(0, 5)
      }

      console.log('[TaskBoard] Parsed subtasks:', subtasks)

      if (Array.isArray(subtasks) && subtasks.length > 0) {
        const newSubtasks = subtasks.map(t => ({
          id: crypto.randomUUID(),
          title: typeof t === 'string' ? t : String(t),
          completed: false
        }))
        return newSubtasks
      }
      return []
    } catch (error) {
      console.error('AI Breakdown failed', error)
      alert('Failed to generate subtasks. Please try again.')
      return []
    } finally {
      setIsAiLoading(false)
    }
  }

  return (
    <div className="task-board">
      <div className="board-header">
        <div>
          <h2>Project Tasks</h2>
          <p className="subtitle">{tasks.length} tasks â€¢ {peerCount > 0 ? `${peerCount} peers online` : 'Offline'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleAddTask('todo')}>
          <Plus size={16} /> New Task
        </button>
      </div>

      <div className="board-columns">
        {COLUMNS.map(column => (
          <div
            key={column.id}
            className="column glass"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id)}
          >
            <div className="column-header">
              <div className="column-title-group">
                <span className="status-indicator" style={{ background: column.color }} />
                <h3>{column.title}</h3>
                <span className="count-badge">{tasks.filter(t => t.status === column.id).length}</span>
              </div>
              <button className="btn-icon-sm" onClick={() => handleAddTask(column.id)}>
                <Plus size={14} />
              </button>
            </div>

            <div className="column-content">
              {tasks
                .filter(task => task.status === column.id)
                .map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setEditingTask(task)}
                    onDragStart={() => handleDragStart(task.id)}
                    onDelete={() => handleDeleteTask(task.id)}
                    isDragging={draggingTask === task.id}
                    showDelete={column.id === 'done'}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>

      {editingTask && (
        <TaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveTask}
          onDelete={() => handleDeleteTask(editingTask.id)}
          onAiBreakdown={(currentTask) => handleAiBreakdown(currentTask)}
          isAiLoading={isAiLoading}
        />
      )}

      {showModelSelector && (
        <UnifiedSettingsPanel onClose={() => setShowModelSelector(false)} />
      )}

      <style>{`
        .task-board {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--color-bg);
          color: var(--color-text);
        }
        
        .board-header {
          padding: var(--space-5) var(--space-6);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--color-border-subtle);
        }
        
        .subtitle {
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
          margin-top: 2px;
        }

        .board-columns {
          flex: 1;
          display: flex;
          gap: var(--space-4);
          padding: var(--space-4);
          overflow-x: auto;
        }

        .column {
          flex: 1;
          min-width: 300px;
          max-width: 400px;
          display: flex;
          flex-direction: column;
          background: rgba(10, 10, 10, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-radius: var(--radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }

        .column-header {
          padding: var(--space-3) var(--space-4);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .column-title-group {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .column-title-group h3 {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .count-badge {
          background: var(--color-surface-elevated);
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: var(--text-xs);
          color: var(--color-text-tertiary);
        }

        .btn-icon-sm {
          padding: 4px;
          border-radius: var(--radius-sm);
          color: var(--color-text-tertiary);
          transition: all 0.2s;
        }
        
        .btn-icon-sm:hover {
          background: var(--color-surface-elevated);
          color: var(--color-text);
        }

        .column-content {
          flex: 1;
          padding: var(--space-2);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
      `}</style>
    </div>
  )
}

function TaskCard({ task, onClick, onDragStart, onDelete, isDragging, showDelete }: {
  task: Task;
  onClick: () => void;
  onDragStart: () => void;
  onDelete: () => void;
  isDragging: boolean;
  showDelete: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false)
  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0
  const totalSubtasks = task.subtasks?.length || 0

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.confirm(`Delete "${task.title}"?`)) {
      onDelete()
    }
  }

  return (
    <div
      className={`task-card glass-card ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="task-card-header">
        {showDelete && isHovered && (
          <button className="delete-btn-card" onClick={handleDelete} title="Delete task">
            <Trash2 size={14} />
          </button>
        )}
        <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
        {task.dueDate && (
          <span className="date-badge">
            <Clock size={10} /> {new Date(task.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="task-card-title">{task.title}</div>

      {task.description && (
        <div className="task-card-desc">{task.description.slice(0, 60)}{task.description.length > 60 ? '...' : ''}</div>
      )}

      <div className="task-card-footer">
        {task.tags.length > 0 && (
          <div className="tags-row">
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag} className="tag-mini"># {tag}</span>
            ))}
            {task.tags.length > 2 && <span className="tag-more">+{task.tags.length - 2}</span>}
          </div>
        )}

        {totalSubtasks > 0 && (
          <div className="subtask-indicator" title={`${completedSubtasks}/${totalSubtasks} subtasks`}>
            <CheckCircle2 size={12} /> {completedSubtasks}/{totalSubtasks}
          </div>
        )}
      </div>

      <style>{`
        .task-card {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          cursor: grab;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }

        .glass-card {
          background: rgba(38, 38, 38, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        .glass-card:hover {
          transform: translateY(-2px);
          border-color: rgba(59, 130, 246, 0.4);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
          background: rgba(38, 38, 38, 0.7);
        }

        .delete-btn-card {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 4px;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 4px;
          color: var(--color-error);
          transition: all 0.2s;
          z-index: 10;
        }

        .delete-btn-card:hover {
          background: rgba(239, 68, 68, 0.3);
          transform: scale(1.1);
        }

        .task-card.dragging {
          opacity: 0.5;
          cursor: grabbing;
          transform: rotate(2deg) scale(1.05);
        }

        .task-card-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: var(--space-2);
        }

        .priority-badge {
          font-size: 10px;
          text-transform: uppercase;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
        }
        
        .priority-badge.high { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .priority-badge.medium { background: rgba(234, 179, 8, 0.15); color: #eab308; }
        .priority-badge.low { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

        .date-badge {
          font-size: 10px;
          color: var(--color-text-tertiary);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .task-card-title {
          font-size: var(--text-sm);
          font-weight: var(--font-medium);
          color: var(--color-text);
          margin-bottom: var(--space-1);
          line-height: 1.4;
        }

        .task-card-desc {
          font-size: var(--text-xs);
          color: var(--color-text-secondary);
          margin-bottom: var(--space-2);
          line-height: 1.3;
        }

        .task-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
        }

        .tags-row {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .tag-mini {
          font-size: 10px;
          color: var(--color-text-tertiary);
          background: var(--color-bg);
          padding: 1px 4px;
          border-radius: 3px;
        }

        .subtask-indicator {
          font-size: 11px;
          color: var(--color-text-tertiary);
          display: flex;
          align-items: center;
          gap: 4px;
        }
      `}</style>
    </div>
  )
}

function TaskModal({
  task, onClose, onSave, onDelete, onAiBreakdown, isAiLoading
}: {
  task: Task;
  onClose: () => void;
  onSave: (t: Task) => void;
  onDelete: () => void;
  onAiBreakdown: (currentTask: Task) => Promise<any[]>;
  isAiLoading: boolean;
}) {
  // LOCAL STATE for editing (fixes input lag)
  const [localTask, setLocalTask] = useState<Task>(task)
  const [newTag, setNewTag] = useState('')
  const [newSubtask, setNewSubtask] = useState('')


  const addTag = () => {
    if (newTag.trim() && !localTask.tags.includes(newTag.trim())) {
      setLocalTask({ ...localTask, tags: [...localTask.tags, newTag.trim()] })
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setLocalTask({ ...localTask, tags: localTask.tags.filter(t => t !== tag) })
  }

  const addSubtask = () => {
    if (newSubtask.trim()) {
      setLocalTask({
        ...localTask,
        subtasks: [...(localTask.subtasks || []), { id: crypto.randomUUID(), title: newSubtask.trim(), completed: false }]
      })
      setNewSubtask('')
    }
  }

  const toggleSubtask = (id: string) => {
    const updatedSubtasks = localTask.subtasks?.map(s =>
      s.id === id ? { ...s, completed: !s.completed } : s
    )
    setLocalTask({ ...localTask, subtasks: updatedSubtasks })
  }

  const handleSave = () => {
    onSave(localTask)
  }

  const handleAiBreakdown = async () => {
    const newSubtasks = await onAiBreakdown(localTask)
    if (newSubtasks.length > 0) {
      setLocalTask({
        ...localTask,
        subtasks: [...(localTask.subtasks || []), ...newSubtasks]
      })
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <input
            className="title-input"
            value={localTask.title}
            onChange={e => setLocalTask({ ...localTask, title: e.target.value })}
            placeholder="Task Title"
          />
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="modal-section">
            <label>Description</label>
            <textarea
              className="desc-input"
              value={localTask.description || ''}
              onChange={e => setLocalTask({ ...localTask, description: e.target.value })}
              placeholder="Add details..."
              rows={4}
            />
          </div>

          <div className="modal-row">
            <div className="modal-section">
              <label>Status</label>
              <select
                value={localTask.status}
                onChange={e => setLocalTask({ ...localTask, status: e.target.value as Task['status'] })}
              >
                <option value="todo">To Do</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="modal-section">
              <label>Priority</label>
              <select
                value={localTask.priority}
                onChange={e => setLocalTask({ ...localTask, priority: e.target.value as Task['priority'] })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="modal-section">
              <label>Due Date</label>
              <input
                type="date"
                value={localTask.dueDate ? new Date(localTask.dueDate).toISOString().split('T')[0] : ''}
                onChange={e => setLocalTask({ ...localTask, dueDate: e.target.valueAsDate?.getTime() })}
              />
            </div>
          </div>

          <div className="modal-section">
            <label>Tags</label>
            <div className="tags-container">
              {localTask.tags.map(tag => (
                <span key={tag} className="tag-chip">
                  {tag}
                  <button onClick={() => removeTag(tag)}>Ã—</button>
                </span>
              ))}
              <input
                className="tag-input"
                placeholder="+ Add tag"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                onBlur={addTag}
              />
            </div>
          </div>

          <div className="modal-section">
            <div className="section-header">
              <label>Subtasks</label>
              <button
                className="btn-ai"
                onClick={handleAiBreakdown}
                disabled={isAiLoading}
              >
                <Sparkles size={12} /> {isAiLoading ? 'Generating...' : 'AI Breakdown'}
              </button>
            </div>

            <div className="subtasks-list">
              {localTask.subtasks?.map(subtask => (
                <div key={subtask.id} className="subtask-item">
                  <button
                    className={`checkbox ${subtask.completed ? 'checked' : ''}`}
                    onClick={() => toggleSubtask(subtask.id)}
                  >
                    {subtask.completed && <CheckCircle2 size={14} />}
                  </button>
                  <span className={subtask.completed ? 'completed' : ''}>{subtask.title}</span>
                </div>
              ))}
              <input
                className="subtask-input"
                placeholder="+ Add subtask"
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost delete-btn" onClick={onDelete}>
            <Trash2 size={16} /> Delete
          </button>
          <div className="action-buttons">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <Save size={16} /> Save Changes
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          animation: fadeIn 0.2s ease-out;
        }

        .modal-content {
          width: 600px;
          max-height: 85vh;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-xl);
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { 
            opacity: 0; 
            transform: translateY(20px) scale(0.95);
          }
          to { 
            opacity: 1; 
            transform: translateY(0) scale(1);
          }
        }

        .modal-header {
          padding: var(--space-4) var(--space-6);
          display: flex;
          align-items: flex-start;
          gap: var(--space-4);
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .title-input {
          flex: 1;
          background: transparent;
          font-size: var(--text-xl);
          font-weight: var(--font-semibold);
          color: var(--color-text);
          border: none;
          outline: none;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-6);
          display: flex;
          flex-direction: column;
          gap: var(--space-6);
        }

        .modal-section label {
          display: block;
          font-size: var(--text-xs);
          font-weight: var(--font-medium);
          color: var(--color-text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: var(--space-2);
        }

        .desc-input {
          width: 100%;
          min-height: 100px;
          background: var(--color-surface-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          color: var(--color-text);
          resize: vertical;
          font-family: inherit;
          font-size: var(--text-sm);
          line-height: 1.5;
        }

        .desc-input:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        .modal-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: var(--space-4);
        }

        select, input[type="date"] {
          width: 100%;
          background: var(--color-surface-elevated);
          border: 1px solid var(--color-border);
          padding: var(--space-2);
          border-radius: var(--radius-md);
          color: var(--color-text);
          font-size: var(--text-sm);
        }

        select:focus, input[type="date"]:focus {
          outline: none;
          border-color: var(--color-accent);
        }

        .tags-container {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .tag-chip {
          background: var(--color-surface-elevated);
          border: 1px solid var(--color-border);
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: var(--text-sm);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .tag-chip button {
          opacity: 0.5;
        }
        .tag-chip button:hover { opacity: 1; }

        .tag-input {
          background: transparent;
          border: none;
          min-width: 80px;
          outline: none;
          font-size: var(--text-sm);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-2);
        }

        .btn-ai {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--color-accent);
          background: rgba(59, 130, 246, 0.1);
          padding: 4px 10px;
          border-radius: var(--radius-md);
          border: 1px solid rgba(59, 130, 246, 0.2);
          transition: all 0.2s;
        }
        
        .btn-ai:hover { background: rgba(59, 130, 246, 0.15); }
        .btn-ai:disabled { opacity: 0.5; cursor: not-allowed; }

        .subtasks-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .subtask-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .checkbox {
          width: 20px;
          height: 20px;
          border-radius: 6px;
          border: 2px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-success);
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .checkbox:hover { border-color: var(--color-text-tertiary); }
        .checkbox.checked { border-color: var(--color-success); background: rgba(34, 197, 94, 0.1); }

        .completed {
          text-decoration: line-through;
          color: var(--color-text-muted);
        }

        .subtask-input {
          margin-top: var(--space-2);
          background: transparent;
          border-bottom: 2px solid var(--color-border); 
          padding: 4px 0;
          width: 100%;
          outline: none;
          font-size: var(--text-sm);
        }

        .subtask-input:focus { border-color: var(--color-accent); }

        .modal-footer {
          padding: var(--space-4) var(--space-6);
          border-top: 1px solid var(--color-border-subtle);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .action-buttons {
          display: flex;
          gap: var(--space-2);
        }

        .delete-btn {
          color: var(--color-error);
        }
        .delete-btn:hover { background: rgba(239, 68, 68, 0.1); }
      `}</style>
    </div>
  )
}
