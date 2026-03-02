package com.kalynt.mobile.local

import android.content.Context
import android.util.Log
import androidx.work.*
import com.kalynt.mobile.local.dao.PendingCommandDao
import com.kalynt.mobile.local.entity.CommandStatus
import com.kalynt.mobile.local.entity.PendingCommand
import com.kalynt.mobile.p2p.DesktopConnectionManager
import com.kalynt.mobile.p2p.P2PMessage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

/**
 * Manages synchronization of pending commands with desktop
 */
class CommandSyncManager(
    private val context: Context,
    private val dao: PendingCommandDao,
    private val connectionManager: DesktopConnectionManager
) {
    private val TAG = "CommandSyncManager"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState
    
    private val MAX_RETRIES = 3
    private val RETRY_DELAY_MS = 5000L
    
    init {
        // Monitor connection and sync when connected
        scope.launch {
            connectionManager.connectionState.collect { state ->
                if (state is com.kalynt.mobile.p2p.ConnectionState.Connected) {
                    syncPendingCommands()
                }
            }
        }
    }
    
    /**
     * Queue a command for execution (online or offline)
     */
    suspend fun queueCommand(
        agentId: String,
        command: String,
        params: Map<String, String>,
        priority: Int = 3
    ): String {
        val pendingCommand = PendingCommand(
            agentId = agentId,
            command = command,
            params = Json.encodeToString(params),
            priority = priority
        )
        
        dao.insert(pendingCommand)
        
        // Try immediate sync if connected
        if (connectionManager.connectionState.value is com.kalynt.mobile.p2p.ConnectionState.Connected) {
            syncPendingCommands()
        } else {
            // Schedule background sync
            scheduleSyncWork()
        }
        
        return pendingCommand.id
    }
    
    /**
     * Sync all pending commands with desktop
     */
    suspend fun syncPendingCommands() {
        if (_syncState.value is SyncState.Syncing) {
            Log.d(TAG, "Already syncing, skipping")
            return
        }
        
        _syncState.value = SyncState.Syncing
        
        try {
            val pending = dao.getPendingToSync()
            
            if (pending.isEmpty()) {
                _syncState.value = SyncState.Idle
                return
            }
            
            Log.d(TAG, "Syncing ${pending.size} pending commands")
            
            for (command in pending) {
                syncCommand(command)
            }
            
            _syncState.value = SyncState.Completed
            
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            _syncState.value = SyncState.Error(e.message ?: "Unknown error")
        }
    }
    
    /**
     * Sync a single command
     */
    private suspend fun syncCommand(command: PendingCommand) {
        if (command.retryCount >= MAX_RETRIES) {
            dao.markAsFailed(command.id, CommandStatus.FAILED, "Max retries exceeded")
            return
        }
        
        // Mark as syncing
        dao.update(command.copy(status = CommandStatus.SYNCING))
        
        try {
            val params = Json.decodeFromString<Map<String, String>>(command.params)
            
            val result = connectionManager.executeCommand(
                agentId = command.agentId,
                command = command.command,
                params = params
            )
            
            result.onSuccess { response: P2PMessage.CommandResponse ->
                dao.markAsCompleted(
                    command.id,
                    CommandStatus.COMPLETED,
                    response.requestId
                )
                Log.d(TAG, "Command ${command.id} synced successfully")
            }.onFailure { error: Throwable ->
                handleSyncFailure(command, error.message)
            }
            
        } catch (e: Exception) {
            handleSyncFailure(command, e.message)
        }
    }
    
    /**
     * Handle sync failure with retry logic
     */
    private suspend fun handleSyncFailure(command: PendingCommand, error: String?) {
        val newRetryCount = command.retryCount + 1
        
        if (newRetryCount >= MAX_RETRIES) {
            dao.markAsFailed(command.id, CommandStatus.FAILED, error)
            Log.w(TAG, "Command ${command.id} failed after $MAX_RETRIES retries")
        } else {
            // Update retry count and keep pending
            dao.update(
                command.copy(
                    status = CommandStatus.PENDING,
                    retryCount = newRetryCount,
                    lastError = error,
                    lastRetryAt = System.currentTimeMillis()
                )
            )
            
            // Schedule retry
            delay(RETRY_DELAY_MS)
        }
    }
    
    /**
     * Cancel a pending command
     */
    suspend fun cancelCommand(commandId: String): Boolean {
        val command = dao.getById(commandId) ?: return false
        
        if (command.status == CommandStatus.SYNCING) {
            // Can't cancel while syncing
            return false
        }
        
        dao.update(command.copy(status = CommandStatus.CANCELLED))
        return true
    }
    
    /**
     * Retry a failed command
     */
    suspend fun retryCommand(commandId: String): Boolean {
        val command = dao.getById(commandId) ?: return false
        
        if (command.status != CommandStatus.FAILED) {
            return false
        }
        
        dao.update(
            command.copy(
                status = CommandStatus.PENDING,
                retryCount = 0,
                lastError = null
            )
        )
        
        syncPendingCommands()
        return true
    }
    
    /**
     * Clean up old completed commands
     */
    suspend fun cleanupOldCommands(olderThanDays: Int = 7) {
        val cutoff = System.currentTimeMillis() - (olderThanDays * 24 * 60 * 60 * 1000)
        dao.deleteOldByStatus(CommandStatus.COMPLETED, cutoff)
        dao.deleteOldByStatus(CommandStatus.FAILED, cutoff)
        dao.deleteOldByStatus(CommandStatus.CANCELLED, cutoff)
    }
    
    /**
     * Schedule background sync work
     */
    private fun scheduleSyncWork() {
        val syncWork = OneTimeWorkRequestBuilder<CommandSyncWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build()
            )
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                WorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build()
        
        WorkManager.getInstance(context)
            .enqueueUniqueWork(
                "command_sync",
                ExistingWorkPolicy.KEEP,
                syncWork
            )
    }
}

/**
 * WorkManager worker for background sync
 */
class CommandSyncWorker(
    context: Context,
    params: WorkerParameters,
    private val syncManager: CommandSyncManager
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        return try {
            syncManager.syncPendingCommands()
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
}

sealed class SyncState {
    object Idle : SyncState()
    object Syncing : SyncState()
    object Completed : SyncState()
    data class Error(val message: String) : SyncState()
}