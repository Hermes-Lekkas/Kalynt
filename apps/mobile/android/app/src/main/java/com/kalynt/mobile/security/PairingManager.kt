package com.kalynt.mobile.security

import android.content.Context
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.TimeUnit
import javax.crypto.KeyAgreement
import javax.crypto.spec.SecretKeySpec

/**
 * Manages device pairing with desktop via QR code
 * Uses ECDH for secure key exchange
 */
class PairingManager(
    private val context: Context,
    private val tokenStorage: SecureTokenStorage
) {
    companion object {
        private const val TAG = "PairingManager"
        private const val PAIRING_TIMEOUT_MS = 300000L // 5 minutes
    }
    
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private val json = Json { ignoreUnknownKeys = true }
    
    /**
     * QR Code data structure
     */
    @Serializable
    data class QRCodeData(
        val desktopIp: String,
        val desktopPort: Int,
        val tempToken: String,
        val desktopPublicKey: String,
        val timestamp: Long
    )
    
    /**
     * Pairing request to desktop
     */
    @Serializable
    data class PairingRequest(
        val tempToken: String,
        val devicePublicKey: String,
        val deviceInfo: DeviceInfo,
        val timestamp: Long
    )
    
    /**
     * Pairing response from desktop
     */
    @Serializable
    data class PairingResponse(
        val success: Boolean,
        val accessToken: String? = null,
        val refreshToken: String? = null,
        val sessionKey: String? = null,
        val error: String? = null
    )
    
    /**
     * Device information for pairing
     */
    @Serializable
    data class DeviceInfo(
        val deviceId: String,
        val deviceName: String,
        val osVersion: String,
        val appVersion: String
    )
    
    /**
     * Parse QR code and initiate pairing
     */
    suspend fun pairFromQRCode(qrCodeContent: String): Result<PairingResult> = withContext(Dispatchers.IO) {
        try {
            // Decode QR code data
            val qrData = parseQRCode(qrCodeContent)
            
            // Validate timestamp (prevent replay attacks)
            val currentTime = System.currentTimeMillis()
            if (currentTime - qrData.timestamp > PAIRING_TIMEOUT_MS) {
                return@withContext Result.failure(
                    PairingException("QR code expired. Please generate a new one on desktop.")
                )
            }
            
            // Generate ephemeral keypair for ECDH
            val keyPair = generateECDHKeyPair()
            
            // Create pairing request
            val deviceInfo = DeviceInfo(
                deviceId = getDeviceId(),
                deviceName = getDeviceName(),
                osVersion = "Android ${android.os.Build.VERSION.RELEASE}",
                appVersion = "1.0.5"
            )
            
            val request = PairingRequest(
                tempToken = qrData.tempToken,
                devicePublicKey = Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP),
                deviceInfo = deviceInfo,
                timestamp = currentTime
            )
            
            // Send to desktop
            val response = sendPairingRequest(qrData.desktopIp, qrData.desktopPort, request)
            
            if (!response.success) {
                return@withContext Result.failure(
                    PairingException(response.error ?: "Pairing rejected by desktop")
                )
            }
            
            // Derive session key using ECDH
            val sessionKey = deriveSessionKey(
                keyPair.private,
                Base64.decode(qrData.desktopPublicKey, Base64.NO_WRAP)
            )
            
            // Store credentials
            tokenStorage.storeAccessToken(response.accessToken!!)
            tokenStorage.storeRefreshToken(response.refreshToken!!)
            tokenStorage.storeSessionKey(Base64.encodeToString(sessionKey, Base64.NO_WRAP))
            tokenStorage.storeDesktopInfo(qrData.desktopIp, qrData.desktopPort)
            
            Result.success(
                PairingResult(
                    desktopIp = qrData.desktopIp,
                    desktopPort = qrData.desktopPort,
                    deviceName = deviceInfo.deviceName
                )
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Pairing failed", e)
            Result.failure(PairingException("Pairing failed: ${e.message}"))
        }
    }
    
    /**
     * Unpair device - clears all credentials
     */
    suspend fun unpair(): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            // Optionally notify desktop about unpairing
            notifyUnpair()
            
            // Clear all stored credentials
            tokenStorage.clearAllTokens()
            
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
    
    /**
     * Check if device is paired
     */
    fun isPaired(): Boolean {
        return tokenStorage.isDevicePaired()
    }
    
    /**
     * Get paired desktop info
     */
    fun getPairedDesktop(): PairedDesktop? {
        if (!isPaired()) return null
        
        return PairedDesktop(
            ip = tokenStorage.getDesktopIp() ?: return null,
            port = tokenStorage.getDesktopPort()
        )
    }
    
    private fun parseQRCode(content: String): QRCodeData {
        return try {
            json.decodeFromString(content)
        } catch (e: Exception) {
            // Try base64 decoding first
            val decoded = Base64.decode(content, Base64.DEFAULT)
            json.decodeFromString(String(decoded))
        }
    }
    
    private fun generateECDHKeyPair(): java.security.KeyPair {
        val keyPairGenerator = KeyPairGenerator.getInstance("EC")
        keyPairGenerator.initialize(ECGenParameterSpec("secp256r1"))
        return keyPairGenerator.generateKeyPair()
    }
    
    private fun deriveSessionKey(privateKey: java.security.PrivateKey, publicKeyBytes: ByteArray): ByteArray {
        val keyAgreement = KeyAgreement.getInstance("ECDH")
        keyAgreement.init(privateKey)
        
        val publicKeySpec = java.security.spec.X509EncodedKeySpec(publicKeyBytes)
        val keyFactory = java.security.KeyFactory.getInstance("EC")
        val publicKey = keyFactory.generatePublic(publicKeySpec)
        
        keyAgreement.doPhase(publicKey, true)
        return keyAgreement.generateSecret()
    }
    
    private suspend fun sendPairingRequest(
        ip: String,
        port: Int,
        request: PairingRequest
    ): PairingResponse = withContext(Dispatchers.IO) {
        val requestBody = json.encodeToString(request)
            .toRequestBody("application/json".toMediaType())
        
        val httpRequest = Request.Builder()
            .url("http://$ip:${port + 1}/pair") // HTTP endpoint for pairing
            .post(requestBody)
            .header("Content-Type", "application/json")
            .build()
        
        httpClient.newCall(httpRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw PairingException("Pairing request failed: ${response.code}")
            }
            
            val responseBody = response.body?.string()
                ?: throw PairingException("Empty response from desktop")
            
            json.decodeFromString(responseBody)
        }
    }
    
    private suspend fun notifyUnpair() {
        try {
            val desktop = getPairedDesktop() ?: return
            val token = tokenStorage.getAccessToken() ?: return
            
            val request = Request.Builder()
                .url("https://${desktop.ip}:${desktop.port}/unpair")
                .header("Authorization", "Bearer $token")
                .post("".toRequestBody())
                .build()
            
            httpClient.newCall(request).execute().close()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to notify desktop about unpair", e)
            // Don't fail if desktop is unreachable
        }
    }
    
    private fun getDeviceId(): String {
        return android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown-${System.currentTimeMillis()}"
    }
    
    private fun getDeviceName(): String {
        val manufacturer = android.os.Build.MANUFACTURER
        val model = android.os.Build.MODEL
        return "$manufacturer $model"
    }
}

data class PairingResult(
    val desktopIp: String,
    val desktopPort: Int,
    val deviceName: String
)

data class PairedDesktop(
    val ip: String,
    val port: Int
)

class PairingException(message: String) : Exception(message)