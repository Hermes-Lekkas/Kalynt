package com.kalynt.mobile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kalynt.mobile.local.CommandSyncManager
import com.kalynt.mobile.local.SyncState
import com.kalynt.mobile.p2p.ConnectionState
import com.kalynt.mobile.p2p.DesktopConnectionManager
import com.kalynt.mobile.p2p.DesktopInfo
import com.kalynt.mobile.security.PairingManager
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

class MainViewModel(
    private val connectionManager: DesktopConnectionManager,
    private val pairingManager: PairingManager,
    private val syncManager: CommandSyncManager
) : ViewModel() {

    val connectionState: StateFlow<ConnectionState> = connectionManager.connectionState
    val syncState: StateFlow<SyncState> = syncManager.syncState

    private val _isPaired = MutableStateFlow(pairingManager.isPaired())
    val isPaired: StateFlow<Boolean> = _isPaired.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _pendingCount = MutableStateFlow(0)
    val pendingCount: StateFlow<Int> = _pendingCount.asStateFlow()

    init {
        // Auto-connect if paired
        if (pairingManager.isPaired()) {
            val desktop = pairingManager.getPairedDesktop()
            desktop?.let {
                connectionManager.connect(it.ip, it.port)
            }
        }

        // Monitor sync state for pending count
        viewModelScope.launch {
            syncState.collect { state ->
                // TODO: Get actual pending count from DAO
            }
        }
    }

    fun handleQRCode(qrContent: String) {
        viewModelScope.launch {
            val result = pairingManager.pairFromQRCode(qrContent)
            result.onSuccess { pairingResult ->
                _isPaired.value = true
                connectionManager.connect(pairingResult.desktopIp, pairingResult.desktopPort)
            }.onFailure { error ->
                _errorMessage.value = error.message
            }
        }
    }

    fun unpair() {
        viewModelScope.launch {
            pairingManager.unpair()
            connectionManager.disconnect()
            _isPaired.value = false
        }
    }

    fun reconnect() {
        val desktop = pairingManager.getPairedDesktop()
        desktop?.let {
            connectionManager.connect(it.ip, it.port)
        }
    }

    fun clearError() {
        _errorMessage.value = null
    }

    fun cleanup() {
        // Don't disconnect on cleanup - keep connection alive
    }
}