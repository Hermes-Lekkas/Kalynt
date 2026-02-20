/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { useState, useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { useYDoc, useYArray } from '../hooks/useYjs'
import { offlineLLMService, type ChatMessage } from '../services/offlineLLMService'
import { useModelStore } from '../stores/modelStore'
import UnifiedSettingsPanel from './UnifiedSettingsPanel'
import { 
  Plus, X, Sparkles, CheckCircle2, Clock, Trash2, 
  CheckSquare, ListTodo, User
} from 'lucide-react'

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
  { id: 'todo', title: 'Strategy', icon: <ListTodo size={14} />, color: '#6b7280' },
  { id: 'in-progress', title: 'Execution', icon: <Clock size={14} />, color: '#3b82f6' },
  { id: 'done', title: 'Verified', icon: <CheckCircle2 size={14} />, color: '#10b981' },
] as const

export default function TaskBoard() {
  const { currentSpace, userName } = useAppStore()
  const { doc, peerCount } = useYDoc(currentSpace?.id ?? null)
  const { items: tasks, push, update, remove } = useYArray<Task>(doc, 'tasks')
  const { loadedModelId } = useModelStore()

  const [draggingTask, setDraggingTask] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)

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

  const handleAddTask = (status: Task['status'] = 'todo') => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      title: 'New Workspace Objective',
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
    if (index !== -1) update(index, updatedTask)
    setEditingTask(null)
  }

  const handleAiBreakdown = async (task: Task): Promise<{ id: string; title: string; completed: boolean }[]> => {
    if (!loadedModelId) {
      setShowModelSelector(true)
      return []
    }

    setIsAiLoading(true)
    try {
      const prompt = `Break down this task into 3-5 actionable subtasks: "${task.title}". 
${task.description ? `Context: ${task.description}` : ''}

Return ONLY a JSON array of strings, for example:
["First subtask", "Second subtask", "Third subtask"]`

      const history: ChatMessage[] = [
        { role: 'system', content: 'You are a task planning assistant. Respond only with JSON.' },
        { role: 'user', content: prompt }
      ]

      let fullResponse = ''
      await offlineLLMService.generateStream(history, (token) => {
        fullResponse += token
      }, { jsonSchema: undefined })

      const jsonMatch = fullResponse.match(/\[[\s\S]*?\]/)
      if (jsonMatch) {
        const subtasks: string[] = JSON.parse(jsonMatch[0])
        return subtasks.map(t => ({ id: crypto.randomUUID(), title: t, completed: false }))
      }
      return []
    } catch (error) {
      console.error('AI Breakdown failed', error)
      return []
    } finally {
      setIsAiLoading(false)
    }
  }

  return (
    <div className="task-panel">
      <header className="board-header">
        <div className="header-info">
          <h2>Mission Objectives</h2>
          <span className="subtitle">{tasks.length} Active Targets â€¢ {peerCount + 1} Authorized Nodes</span>
        </div>
        <button className="btn-premium-action" onClick={() => handleAddTask('todo')}>
          <Plus size={16} />
          <span>New Objective</span>
        </button>
      </header>

      <div className="board-container">
        {COLUMNS.map(column => (
          <div
            key={column.id}
            className="column-premium"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id)}
          >
            <div className="column-header">
              <div className="col-title">
                <div className="col-icon" style={{ color: column.color }}>{column.icon}</div>
                <h3>{column.title}</h3>
                <span className="col-count">{tasks.filter(t => t.status === column.id).length}</span>
              </div>
              <button className="btn-add-subtle" onClick={() => handleAddTask(column.id)}>
                <Plus size={14} />
              </button>
            </div>

            <div className="column-scroll">
              {tasks
                .filter(task => task.status === column.id)
                .map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => setEditingTask(task)}
                    onDragStart={() => handleDragStart(task.id)}
                    isDragging={draggingTask === task.id}
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
          onAiBreakdown={handleAiBreakdown}
          isAiLoading={isAiLoading}
          userName={userName}
        />
      )}

      {showModelSelector && <UnifiedSettingsPanel onClose={() => setShowModelSelector(false)} />}

      <style>{`
        .task-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--color-bg);
          color: var(--color-text);
        }

        .board-header {
          padding: 24px 32px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--color-surface-subtle);
          border-bottom: 1px solid var(--color-border);
        }

        .header-info h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
        .subtitle { font-size: 11px; font-weight: 700; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }

        .btn-premium-action {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 16px;
          height: 36px;
          background: var(--color-text);
          color: var(--color-bg);
          border-radius: 10px;
          font-size: 13px;
          font-weight: 700;
          transition: all 0.2s;
        }

        .btn-premium-action:hover { transform: translateY(-1px); box-shadow: 0 4px 15px var(--color-glass); }

        .board-container {
          flex: 1;
          display: flex;
          gap: 24px;
          padding: 24px;
          overflow-x: auto;
        }

        .column-premium {
          flex: 1;
          min-width: 320px;
          max-width: 400px;
          background: var(--color-surface-subtle);
          border: 1px solid var(--color-border);
          border-radius: 20px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .column-header {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--color-surface-elevated);
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .col-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .col-title h3 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; }
        
        .col-count {
          padding: 2px 8px;
          background: var(--color-glass);
          border-radius: 6px;
          font-size: 10px;
          font-weight: 800;
          color: var(--color-text-tertiary);
        }

        .btn-add-subtle {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-text-muted);
          transition: all 0.2s;
        }

        .btn-add-subtle:hover { background: var(--color-glass); color: var(--color-text); }

        .column-scroll {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
      `}</style>
    </div>
  )
}

function TaskCard({ task, onClick, onDragStart, isDragging }: any) {
  const completedCount = task.subtasks?.filter((s: any) => s.completed).length || 0
  const totalCount = task.subtasks?.length || 0

  return (
    <div
      className={`task-card-premium animate-reveal-up ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
    >
      <div className="card-header">
        <div className={`p-badge ${task.priority}`}>{task.priority}</div>
        <div className="card-user"><User size={10} /></div>
      </div>

      <div className="card-title">{task.title}</div>
      
      {task.description && (
        <div className="card-desc">{task.description.slice(0, 80)}{task.description.length > 80 && '...'}</div>
      )}

      {(task.tags.length > 0 || totalCount > 0) && (
        <div className="card-footer">
          <div className="tag-strip">
            {task.tags.slice(0, 2).map((t: string) => (
              <span key={t} className="mini-tag">#{t}</span>
            ))}
          </div>
          {totalCount > 0 && (
            <div className="subtask-badge">
              <CheckSquare size={10} />
              <span>{completedCount}/{totalCount}</span>
            </div>
          )}
        </div>
      )}

      <style>{`
        .task-card-premium {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          padding: 16px;
          cursor: grab;
          transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
          color: var(--color-text);
        }

        .task-card-premium:hover {
          background: var(--color-surface-elevated);
          border-color: var(--color-accent);
          transform: translateY(-2px) scale(1.01);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
        }

        .task-card-premium.dragging { opacity: 0.4; cursor: grabbing; }

        .card-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .p-badge {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 100px;
        }

        .p-badge.high { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .p-badge.medium { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .p-badge.low { background: rgba(16, 185, 129, 0.1); color: #10b981; }

        .card-user {
          width: 18px; height: 18px;
          background: var(--color-glass);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: var(--color-text-tertiary);
        }

        .card-title { font-size: 14px; font-weight: 700; color: var(--color-text); margin-bottom: 6px; line-height: 1.4; }
        .card-desc { font-size: 12px; color: var(--color-text-tertiary); line-height: 1.5; margin-bottom: 12px; }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid var(--color-border-subtle);
        }

        .tag-strip { display: flex; gap: 4px; }
        .mini-tag { font-size: 10px; font-weight: 700; color: var(--color-accent); opacity: 0.8; }

        .subtask-badge {
          display: flex; align-items: center; gap: 6px;
          font-size: 10px; font-weight: 800; color: var(--color-text-tertiary);
        }
      `}</style>
    </div>
  )
}

function TaskModal({ task, onClose, onSave, onDelete, onAiBreakdown, isAiLoading }: any) {
  const [local, setLocal] = useState<Task>(task)

  const handleAiAction = async () => {
    const subtasks = await onAiBreakdown(local)
    if (subtasks.length > 0) {
      setLocal({ ...local, subtasks: [...(local.subtasks || []), ...subtasks] })
    }
  }

  return (
    <div className="premium-modal-overlay" onClick={onClose}>
      <div className="premium-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-top">
          <input 
            className="title-field" 
            value={local.title} 
            onChange={e => setLocal({...local, title: e.target.value})}
          />
          <button className="btn-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-main">
          <div className="field-group">
            <label>Context & Requirements</label>
            <textarea 
              rows={4}
              value={local.description}
              onChange={e => setLocal({...local, description: e.target.value})}
              placeholder="Define the objective parameters..."
            />
          </div>

          <div className="field-row">
            <div className="field-group">
              <label>Priority</label>
              <select value={local.priority} onChange={e => setLocal({...local, priority: e.target.value as any})}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="field-group">
              <label>Due Date</label>
              <input type="date" value={local.dueDate ? new Date(local.dueDate).toISOString().split('T')[0] : ''} onChange={e => setLocal({...local, dueDate: e.target.valueAsDate?.getTime()})} />
            </div>
          </div>

          <div className="subtask-section">
            <div className="sub-header">
              <label>Execution Steps</label>
              <button className="btn-ai-magic" onClick={handleAiAction} disabled={isAiLoading}>
                <Sparkles size={12} />
                <span>{isAiLoading ? 'Analyzing...' : 'AI Blueprint'}</span>
              </button>
            </div>
            
            <div className="sub-list">
              {local.subtasks?.map(s => (
                <div key={s.id} className="sub-item">
                  <button 
                    className={`sub-check ${s.completed ? 'active' : ''}`}
                    onClick={() => setLocal({...local, subtasks: local.subtasks?.map(st => st.id === s.id ? {...st, completed: !st.completed} : st)})}
                  >
                    {s.completed && <Check size={12} />}
                  </button>
                  <span className={s.completed ? 'completed' : ''}>{s.title}</span>
                </div>
              ))}
              <input 
                className="add-sub-input"
                placeholder="+ Add execution step..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.target as any).value.trim()) {
                    setLocal({...local, subtasks: [...(local.subtasks || []), { id: crypto.randomUUID(), title: (e.target as any).value.trim(), completed: false }]});
                    (e.target as any).value = ''
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer-premium">
          <button className="btn-purge" onClick={onDelete}><Trash2 size={16} /> Purge</button>
          <div className="footer-actions">
            <button className="btn-glass" onClick={onClose}>Cancel</button>
            <button className="btn-solid" onClick={() => onSave(local)}>Save Changes</button>
          </div>
        </div>
      </div>

      <style>{`
        .premium-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(12px);
          display: flex; align-items: center; justify-content: center;
          z-index: 10000;
        }

        .premium-modal {
          width: 560px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          display: flex; flex-direction: column;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.2);
          overflow: hidden;
          color: var(--color-text);
        }

        .modal-top {
          padding: 24px 32px;
          display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .title-field {
          background: none; border: none; outline: none;
          font-size: 20px; font-weight: 800; color: var(--color-text);
          width: 100%;
        }

        .modal-main {
          padding: 32px;
          display: flex; flex-direction: column; gap: 24px;
          max-height: 60vh; overflow-y: auto;
        }

        .field-group { display: flex; flex-direction: column; gap: 8px; }
        .field-group label { font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--color-text-tertiary); letter-spacing: 0.05em; }
        
        .field-group textarea, .field-group select, .field-group input {
          background: var(--color-surface-subtle);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 12px;
          color: var(--color-text); font-size: 14px; outline: none;
        }

        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .sub-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        
        .btn-ai-magic {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 14px; background: var(--color-glass);
          border: 1px solid var(--color-accent-hover);
          border-radius: 100px; color: var(--color-accent); font-size: 11px; font-weight: 700;
        }

        .sub-list { display: flex; flex-direction: column; gap: 8px; }
        
        .sub-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 14px; background: var(--color-surface-subtle);
          border-radius: 12px; font-size: 13px;
        }

        .sub-check {
          width: 18px; height: 18px; border-radius: 6px;
          border: 2px solid var(--color-border);
          display: flex; align-items: center; justify-content: center; color: var(--color-text);
        }
        .sub-check.active { background: #10b981; border-color: #10b981; color: white; }

        .completed { text-decoration: line-through; opacity: 0.4; }

        .add-sub-input {
          background: none; border: none; border-bottom: 1px solid var(--color-border-subtle);
          padding: 8px 0; color: var(--color-text); font-size: 13px; outline: none;
        }

        .modal-footer-premium {
          padding: 24px 32px;
          background: var(--color-surface-subtle);
          display: flex; justify-content: space-between; align-items: center;
        }

        .btn-purge { color: #ef4444; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .footer-actions { display: flex; gap: 12px; }
        .btn-glass { padding: 10px 20px; border-radius: 12px; font-size: 13px; font-weight: 700; color: var(--color-text-tertiary); }
        .btn-solid { padding: 10px 24px; background: var(--color-text); color: var(--color-bg); border-radius: 12px; font-size: 13px; font-weight: 800; }
      `}</style>
    </div>
  )
}

function Check({ size }: any) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
