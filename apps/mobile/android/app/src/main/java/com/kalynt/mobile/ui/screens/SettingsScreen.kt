package com.kalynt.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun SettingsScreen(
    onUnpair: () -> Unit,
    modifier: Modifier = Modifier
) {
    var showUnpairDialog by remember { mutableStateOf(false) }
    
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Settings",
            style = MaterialTheme.typography.headlineMedium
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Connection Section
        SettingsSection(title = "Connection") {
            SettingsItem(
                icon = Icons.Default.Computer,
                title = "Desktop Connection",
                subtitle = "Connected to Kalynt Desktop"
            )
            SettingsItem(
                icon = Icons.Default.LinkOff,
                title = "Unpair Device",
                subtitle = "Disconnect from desktop",
                onClick = { showUnpairDialog = true }
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // About Section
        SettingsSection(title = "About") {
            SettingsItem(
                icon = Icons.Default.Info,
                title = "Version",
                subtitle = "1.0.5"
            )
        }
    }
    
    // Unpair Confirmation Dialog
    if (showUnpairDialog) {
        AlertDialog(
            onDismissRequest = { showUnpairDialog = false },
            title = { Text("Unpair Device") },
            text = { Text("Are you sure you want to unpair? You'll need to scan a QR code again to reconnect.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showUnpairDialog = false
                        onUnpair()
                    }
                ) {
                    Text("Unpair", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showUnpairDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun SettingsSection(
    title: String,
    content: @Composable () -> Unit
) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary
    )
    Spacer(modifier = Modifier.height(8.dp))
    Card {
        Column {
            content()
        }
    }
}

@Composable
fun SettingsItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: (() -> Unit)? = null
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = { Text(subtitle) },
        leadingContent = { Icon(icon, contentDescription = null) },
        modifier = if (onClick != null) Modifier.fillMaxWidth() else Modifier
    )
}
