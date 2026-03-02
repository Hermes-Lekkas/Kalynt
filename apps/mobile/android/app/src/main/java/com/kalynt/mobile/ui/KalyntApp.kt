package com.kalynt.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.kalynt.mobile.MainViewModel
import com.kalynt.mobile.p2p.ConnectionState
import com.kalynt.mobile.ui.screens.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KalyntApp(
    viewModel: MainViewModel,
    onScanQR: () -> Unit
) {
    val connectionState by viewModel.connectionState.collectAsState()
    val isPaired by viewModel.isPaired.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    
    var selectedTab by remember { mutableStateOf(0) }
    
    // Show error dialog
    errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = { viewModel.clearError() },
            title = { Text("Error") },
            text = { Text(message) },
            confirmButton = {
                TextButton(onClick = { viewModel.clearError() }) {
                    Text("OK")
                }
            }
        )
    }
    
    if (!isPaired) {
        // Show pairing screen
        PairingScreen(onScanQR = onScanQR)
    } else {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Kalynt") },
                    actions = {
                        ConnectionStatusIndicator(connectionState)
                    }
                )
            },
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Home, contentDescription = "Dashboard") },
                        label = { Text("Home") },
                        selected = selectedTab == 0,
                        onClick = { selectedTab = 0 }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.SmartToy, contentDescription = "Agents") },
                        label = { Text("Agents") },
                        selected = selectedTab == 1,
                        onClick = { selectedTab = 1 }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Merge, contentDescription = "GitHub") },
                        label = { Text("GitHub") },
                        selected = selectedTab == 2,
                        onClick = { selectedTab = 2 }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Settings, contentDescription = "Settings") },
                        label = { Text("Settings") },
                        selected = selectedTab == 3,
                        onClick = { selectedTab = 3 }
                    )
                }
            }
        ) { padding ->
            when (selectedTab) {
                0 -> DashboardScreen(
                    connectionState = connectionState,
                    onReconnect = { viewModel.reconnect() },
                    modifier = Modifier.padding(padding)
                )
                1 -> AgentsScreen(
                    connectionState = connectionState,
                    modifier = Modifier.padding(padding)
                )
                2 -> GitHubScreen(
                    modifier = Modifier.padding(padding)
                )
                3 -> SettingsScreen(
                    onUnpair = { viewModel.unpair() },
                    modifier = Modifier.padding(padding)
                )
            }
        }
    }
}

@Composable
fun ConnectionStatusIndicator(state: ConnectionState) {
    val (icon, color, description) = when (state) {
        is ConnectionState.Connected -> 
            Triple(Icons.Default.CloudDone, MaterialTheme.colorScheme.primary, "Connected")
        is ConnectionState.Connecting -> 
            Triple(Icons.Default.CloudSync, MaterialTheme.colorScheme.tertiary, "Connecting...")
        is ConnectionState.Error -> 
            Triple(Icons.Default.CloudOff, MaterialTheme.colorScheme.error, "Error")
        else -> 
            Triple(Icons.Default.CloudOff, MaterialTheme.colorScheme.outline, "Disconnected")
    }
    
    Icon(
        imageVector = icon,
        contentDescription = description,
        tint = color
    )
}