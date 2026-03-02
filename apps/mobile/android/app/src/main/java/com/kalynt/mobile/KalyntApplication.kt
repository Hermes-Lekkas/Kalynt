package com.kalynt.mobile

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.kalynt.mobile.github.GitHubProxyClient
import com.kalynt.mobile.local.CommandSyncManager
import com.kalynt.mobile.local.database.AppDatabase
import com.kalynt.mobile.p2p.DesktopConnectionManager
import com.kalynt.mobile.security.PairingManager
import com.kalynt.mobile.security.SecureTokenStorage
import org.koin.android.ext.koin.androidContext
import org.koin.android.ext.koin.androidLogger
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.core.context.startKoin
import org.koin.dsl.module

class KalyntApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Koin dependency injection
        startKoin {
            androidLogger()
            androidContext(this@KalyntApplication)
            modules(appModule)
        }
        
        // Create notification channels
        createNotificationChannels()
    }
    
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channels = listOf(
                NotificationChannel(
                    CHANNEL_AGENT,
                    getString(R.string.channel_agent_name),
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = getString(R.string.channel_agent_description)
                },
                NotificationChannel(
                    CHANNEL_GITHUB,
                    getString(R.string.channel_github_name),
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = getString(R.string.channel_github_description)
                },
                NotificationChannel(
                    CHANNEL_SYSTEM,
                    getString(R.string.channel_system_name),
                    NotificationManager.IMPORTANCE_LOW
                ).apply {
                    description = getString(R.string.channel_system_description)
                }
            )
            
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannels(channels)
        }
    }
    
    companion object {
        const val CHANNEL_AGENT = "agent_updates"
        const val CHANNEL_GITHUB = "github_activity"
        const val CHANNEL_SYSTEM = "system_events"
    }
}

// Koin dependency injection module
val appModule = module {
    // Database
    single { AppDatabase.getInstance(get()) }
    single { get<AppDatabase>().pendingCommandDao() }
    
    // Security
    single { SecureTokenStorage(get()) }
    single { PairingManager(get(), get()) }
    
    // P2P Connection
    single { DesktopConnectionManager(get(), get()) }
    
    // GitHub
    single { GitHubProxyClient(get()) }
    
    // Local Data
    single { CommandSyncManager(get(), get(), get()) }
    
    // ViewModel
    viewModel { MainViewModel(get(), get(), get()) }
}