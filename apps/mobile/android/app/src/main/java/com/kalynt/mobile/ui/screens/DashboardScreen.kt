package com.kalynt.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kalynt.mobile.p2p.ConnectionState

@Composable
fun DashboardScreen(
    connectionState: ConnectionState,
    onReconnect: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Connection Status Card
        Card(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = when (connectionState) {
                            is ConnectionState.Connected -> Icons.Default.CloudDone
                            is ConnectionState.Connecting -> Icons.Default.CloudSync
                            else -> Icons.Default.CloudOff
                        },
                        contentDescription = null,
                        tint = when (connectionState) {
                            is ConnectionState.Connected -> MaterialTheme.colorScheme.primary
                            is ConnectionState.Connecting -> MaterialTheme.colorScheme.tertiary
                            else -> MaterialTheme.colorScheme.error
                        }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = when (connectionState) {
                            is ConnectionState.Connected -> "Connected to Desktop"
                            is ConnectionState.Connecting -> "Connecting..."
                            is ConnectionState.Error -> "Connection Error"
                            else -> "Disconnected"
                        },
                        style = MaterialTheme.typography.titleMedium
                    )
                }
                
                if (connectionState !is ConnectionState.Connected) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(
                        onClick = onReconnect,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Reconnect")
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Quick Actions
        Text(
            text = "Quick Actions",
            style = MaterialTheme.typography.titleMedium
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            QuickActionButton(
                icon = Icons.Default.SmartToy,
                label = "Agents",
                onClick = { }
            )
            QuickActionButton(
                icon = Icons.Default.Merge,
                label = "PRs",
                onClick = { }
            )
            QuickActionButton(
                icon = Icons.Default.History,
                label = "History",
                onClick = { }
            )
        }
    }
}

@Composable
fun QuickActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        FilledIconButton(
            onClick = onClick
        ) {
            Icon(icon, contentDescription = label)
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall
        )
    }
}