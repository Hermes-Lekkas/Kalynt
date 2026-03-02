package com.kalynt.mobile.local.dao

import androidx.room.*
import com.kalynt.mobile.local.entity.CommandStatus
import com.kalynt.mobile.local.entity.PendingCommand
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingCommandDao {
    
    @Query("SELECT * FROM pending_commands WHERE status = :status ORDER BY priority ASC, createdAt ASC")
    fun getByStatus(status: CommandStatus): Flow<List<PendingCommand>>
    
    @Query("SELECT * FROM pending_commands WHERE status = :status ORDER BY priority ASC, createdAt ASC")
    suspend fun getByStatusSync(status: CommandStatus): List<PendingCommand>
    
    @Query("SELECT * FROM pending_commands ORDER BY createdAt DESC")
    fun getAll(): Flow<List<PendingCommand>>
    
    @Query("SELECT * FROM pending_commands WHERE id = :id")
    suspend fun getById(id: String): PendingCommand?
    
    @Query("SELECT COUNT(*) FROM pending_commands WHERE status = :status")
    suspend fun getCountByStatus(status: CommandStatus): Int
    
    @Query("SELECT * FROM pending_commands WHERE status IN ('PENDING', 'SYNCING') ORDER BY priority ASC, createdAt ASC")
    suspend fun getPendingToSync(): List<PendingCommand>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(command: PendingCommand)
    
    @Update
    suspend fun update(command: PendingCommand)
    
    @Delete
    suspend fun delete(command: PendingCommand)
    
    @Query("DELETE FROM pending_commands WHERE status = :status AND createdAt < :olderThan")
    suspend fun deleteOldByStatus(status: CommandStatus, olderThan: Long)
    
    @Query("UPDATE pending_commands SET status = :status, syncedCommandId = :syncedId WHERE id = :id")
    suspend fun markAsCompleted(id: String, status: CommandStatus = CommandStatus.COMPLETED, syncedId: String?)
    
    @Query("UPDATE pending_commands SET status = :status, lastError = :error, retryCount = retryCount + 1, lastRetryAt = :timestamp WHERE id = :id")
    suspend fun markAsFailed(id: String, status: CommandStatus = CommandStatus.FAILED, error: String?, timestamp: Long = System.currentTimeMillis())
    
    @Query("UPDATE pending_commands SET status = :newStatus WHERE status = :oldStatus")
    suspend fun updateStatus(oldStatus: CommandStatus, newStatus: CommandStatus)
    
    @Query("DELETE FROM pending_commands")
    suspend fun deleteAll()
}