package com.kalynt.mobile.local.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.kalynt.mobile.local.dao.PendingCommandDao
import com.kalynt.mobile.local.entity.PendingCommand

@Database(
    entities = [PendingCommand::class],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun pendingCommandDao(): PendingCommandDao
    
    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }
        
        private fun buildDatabase(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                "kalynt_commands.db"
            )
            .fallbackToDestructiveMigration() // For development only
            .build()
        }
    }
}