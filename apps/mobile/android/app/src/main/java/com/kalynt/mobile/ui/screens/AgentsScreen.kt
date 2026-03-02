package com.kalynt.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.SmartToy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kalynt.mobile.p2p.ConnectionState

@Composable
fun AgentsScreen(
    connectionState: ConnectionState,
    modifier: Modifier = Modifier
) {
    var commandText by remember { mutableStateOf("") }
    
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "AI Agents",
            style = MaterialTheme.typography.headlineMedium
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Agent List (Placeholder)
        LazyColumn(
            modifier = Modifier.weight(1f)
        ) {
            items(listOf("Code Agent", "Review Agent", "Debug Agent")) { agent ->
                AgentCard(agentName = agent, status = "Idle")
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
        
        // Quick Command Input
        if (connectionState is ConnectionState.Connected) {
            OutlinedTextField(
                value = commandText,
                onValueChange = { commandText = it },
                label = { Text("Quick Command") },
                trailingIcon = {
                    IconButton(
                        onClick = { /* Send command */ },
                        enabled = commandText.isNotBlank()
                    ) {
                        Icon(Icons.Default.Send, contentDescription = "Send")
                    }
                },
                modifier = Modifier.fillMaxWidth()
            )
        } else {
            Text(
                text = "Connect to desktop to send commands",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun AgentCard(agentName: String, status: String) {
    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.SmartToy,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = agentName,
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = status,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}