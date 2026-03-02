package com.kalynt.mobile.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Merge
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun GitHubScreen(
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Text(
            text = "Pull Requests",
            style = MaterialTheme.typography.headlineMedium
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // PR List (Placeholder)
        LazyColumn {
            items(listOf("#123 Feature X", "#124 Bugfix Y", "#125 Refactor Z")) { pr ->
                PRCard(prTitle = pr, hasConflict = pr.contains("Bugfix"))
                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
fun PRCard(prTitle: String, hasConflict: Boolean) {
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
                imageVector = if (hasConflict) Icons.Default.Warning else Icons.Default.Merge,
                contentDescription = null,
                tint = if (hasConflict) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = prTitle,
                    style = MaterialTheme.typography.titleMedium
                )
                if (hasConflict) {
                    Text(
                        text = "Merge conflict",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}
