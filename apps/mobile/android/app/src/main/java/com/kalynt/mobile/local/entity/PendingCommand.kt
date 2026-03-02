package com.kalynt.mobile.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Index
import java.util.UUID

/**
 * Entity for storing pending commands when offline
 */
@Entity(
    tableName = "pending_commands",
    indices = [
        Index(value = ["status"]),
        Index(value = ["createdAt"])
    ]
)
data class PendingCommand(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    
    val agentId: String,
    val command: String,
    val params: String, // JSON string
    val priority: Int = 3, // 1-5, lower = higher priority
    
    val createdAt: Long = System.currentTimeMillis(),
    val retryCount: Int = 0,
    val lastError: String? = null,
    val lastRetryAt: Long? = null,
    
    val status: CommandStatus = CommandStatus.PENDING,
    val syncedCommandId: String? = null // ID assigned by desktop after sync
)

enum class CommandStatus {
    PENDING,      // Waiting to be sent
    SYNCING,      // Currently being sent
    COMPLETED,    // Successfully executed
    FAILED,       // Failed after max retries
    CANCELLED     // User cancelled
}
