package com.kalynt.mobile.p2p

import android.content.Context
import android.util.Log
import com.kalynt.mobile.security.SecureTokenStorage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.Json
import okhttp3.*
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

sealed class ConnectionState {
    object Disconnected : ConnectionState()
    object Connecting : ConnectionState()
    data class Connected(val desktopInfo: DesktopInfo) : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}

data class DesktopInfo(
    val ip: String,
    val port: Int,
    val version: String,
    val deviceName: String
)

class DesktopConnectionManager(
    private val context: Context,
    private val tokenStorage: SecureTokenStorage
) {
    private val TAG = "DesktopConnection"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState
    
    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private val messageListeners = mutableListOf<(P2PMessage) -> Unit>()
    
    // Connection configuration
    private val RECONNECT_DELAY_MS = 5000L
    private val MAX_RECONNECT_ATTEMPTS = 10
    private var reconnectAttempts = 0
    
    private val client = createSecureClient()
    private val json = Json { ignoreUnknownKeys = true }
    
    /**
     * Creates OkHttp client with security configurations
     */
    private fun createSecureClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS) // No timeout for WebSocket
            .writeTimeout(30, TimeUnit.SECONDS)
            .pingInterval(30, TimeUnit.SECONDS)
            .build()
    }
    
    /**
     * Connect to desktop using stored credentials
     */
    fun connect(desktopIp: String, desktopPort: Int = 8443) {
        if (_connectionState.value is ConnectionState.Connecting) {
            Log.d(TAG, "Already connecting, ignoring duplicate request")
            return
        }
        
        scope.launch {
            _connectionState.value = ConnectionState.Connecting
            
            try {
                val token = tokenStorage.getAccessToken()
                    ?: throw SecurityException("No auth token available")
                
                val request = Request.Builder()
                    .url("wss://$desktopIp:$desktopPort/mobile")
                    .header("Authorization", "Bearer $token")
                    .header("X-Device-ID", getDeviceId())
                    .header("X-App-Version", "1.0.5")
                    .build()
                
                webSocket = client.newWebSocket(request, WebSocketListener())
                
            } catch (e: Exception) {
                Log.e(TAG, "Connection failed", e)
                _connectionState.value = ConnectionState.Error(e.message ?: "Unknown error")
                scheduleReconnect(desktopIp, desktopPort)
            }
        }
    }
    
    /**
     * Disconnect from desktop
     */
    fun disconnect() {
        reconnectJob?.cancel()
        reconnectAttempts = 0
        webSocket?.close(1000, "User initiated disconnect")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
    }
    
    /**
     * Send message to desktop
     */
    fun sendMessage(message: P2PMessage): Boolean {
        val socket = webSocket ?: run {
            Log.w(TAG, "Cannot send message - not connected")
            return false
        }
        
        return try {
            val jsonString = json.encodeToString(P2PMessage.serializer(), message)
            socket.send(jsonString)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send message", e)
            false
        }
    }
    
    /**
     * Register listener for incoming messages
     */
    fun addMessageListener(listener: (P2PMessage) -> Unit) {
        messageListeners.add(listener)
    }
    
    /**
     * Unregister message listener
     */
    fun removeMessageListener(listener: (P2PMessage) -> Unit) {
        messageListeners.remove(listener)
    }
    
    /**
     * Execute agent command
     */
    suspend fun executeCommand(
        agentId: String,
        command: String,
        params: Map<String, String> = emptyMap()
    ): Result<P2PMessage.CommandResponse> = withContext(Dispatchers.IO) {
        val requestId = generateRequestId()
        val message = P2PMessage.ExecuteCommand(
            requestId = requestId,
            agentId = agentId,
            command = command,
            params = params
        )
        
        if (!sendMessage(message)) {
            return@withContext Result.failure(Exception("Not connected to desktop"))
        }
        
        // Wait for response with timeout
        try {
            val response = waitForResponse(requestId, timeoutMs = 30000)
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    private suspend fun waitForResponse(requestId: String, timeoutMs: Long): P2PMessage.CommandResponse {
        return suspendCancellableCoroutine { continuation ->
            lateinit var listener: (P2PMessage) -> Unit
            listener = { message ->
                if (message is P2PMessage.CommandResponse && message.requestId == requestId) {
                    removeMessageListener(listener)
                    if (message.error != null) {
                        continuation.resumeWith(Result.failure(Exception(message.error)))
                    } else {
                        continuation.resumeWith(Result.success(message))
                    }
                }
            }
            
            addMessageListener(listener)
            
            // Timeout handling
            scope.launch {
                delay(timeoutMs)
                removeMessageListener(listener)
                if (continuation.isActive) {
                    continuation.resumeWith(Result.failure(TimeoutException()))
                }
            }
        }
    }
    
    private fun scheduleReconnect(desktopIp: String, desktopPort: Int) {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            Log.w(TAG, "Max reconnect attempts reached")
            _connectionState.value = ConnectionState.Error("Connection lost. Please re-pair with desktop.")
            return
        }
        
        reconnectAttempts++
        Log.d(TAG, "Scheduling reconnect attempt $reconnectAttempts/$MAX_RECONNECT_ATTEMPTS")
        
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            connect(desktopIp, desktopPort)
        }
    }
    
    private fun getDeviceId(): String {
        return android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown"
    }
    
    private fun generateRequestId(): String {
        return System.currentTimeMillis().toString(36) + (0..999).random()
    }
    
    inner class WebSocketListener : okhttp3.WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket connected")
            reconnectAttempts = 0
            // Desktop will send DesktopInfo message
        }
        
        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = json.decodeFromString(P2PMessage.serializer(), text)
                
                // Update connection state if this is desktop info
                if (message is P2PMessage.DesktopInfo) {
                    _connectionState.value = ConnectionState.Connected(
                        DesktopInfo(
                            ip = message.ip,
                            port = message.port,
                            version = message.version,
                            deviceName = message.deviceName
                        )
                    )
                }
                
                // Notify all listeners
                messageListeners.forEach { listener ->
                    try {
                        listener(message)
                    } catch (e: Exception) {
                        Log.e(TAG, "Message listener failed", e)
                    }
                }
                
            } catch (e: Exception) {
                Log.e(TAG, "Failed to parse message: $text", e)
            }
        }
        
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closing: $code - $reason")
            _connectionState.value = ConnectionState.Disconnected
        }
        
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closed: $code - $reason")
            _connectionState.value = ConnectionState.Disconnected
        }
        
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket failure", t)
            _connectionState.value = ConnectionState.Error(t.message ?: "Connection failed")
            
            // Get current desktop info for reconnect
            val currentState = _connectionState.value
            if (currentState is ConnectionState.Connected) {
                scheduleReconnect(currentState.desktopInfo.ip, currentState.desktopInfo.port)
            }
        }
    }
    
    class TimeoutException : Exception("Command timed out")
}