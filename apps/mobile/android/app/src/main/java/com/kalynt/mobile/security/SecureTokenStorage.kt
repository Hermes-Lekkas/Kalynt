package com.kalynt.mobile.security

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Secure token storage using Android Keystore
 * All sensitive data is encrypted at rest
 */
class SecureTokenStorage(context: Context) {
    
    companion object {
        private const val KEYSTORE_ALIAS = "KalyntMasterKey"
        private const val PREFS_FILE = "kalynt_secure_tokens"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_GITHUB_TOKEN = "github_token"
        private const val KEY_SESSION_KEY = "session_key"
        private const val KEY_DESKTOP_IP = "desktop_ip"
        private const val KEY_DESKTOP_PORT = "desktop_port"
        private const val KEY_DEVICE_PAIRED = "device_paired"
        private const val GCM_TAG_LENGTH = 128
    }
    
    private val masterKey: MasterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val encryptedPrefs: EncryptedSharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    ) as EncryptedSharedPreferences
    
    // Access Token (short-lived, 15 minutes)
    suspend fun storeAccessToken(token: String) = withContext(Dispatchers.IO) {
        encryptedPrefs.edit().putString(KEY_ACCESS_TOKEN, token).apply()
    }
    
    fun getAccessToken(): String? {
        return encryptedPrefs.getString(KEY_ACCESS_TOKEN, null)
    }
    
    // Refresh Token (long-lived, used to get new access tokens)
    suspend fun storeRefreshToken(token: String) = withContext(Dispatchers.IO) {
        encryptedPrefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    }
    
    fun getRefreshToken(): String? {
        return encryptedPrefs.getString(KEY_REFRESH_TOKEN, null)
    }
    
    // GitHub Token (encrypted separately with biometric requirement in production)
    suspend fun storeGitHubToken(token: String) = withContext(Dispatchers.IO) {
        encryptedPrefs.edit().putString(KEY_GITHUB_TOKEN, token).apply()
    }
    
    fun getGitHubToken(): String? {
        return encryptedPrefs.getString(KEY_GITHUB_TOKEN, null)
    }
    
    // Session Key (for end-to-end encryption)
    suspend fun storeSessionKey(key: String) = withContext(Dispatchers.IO) {
        encryptedPrefs.edit().putString(KEY_SESSION_KEY, key).apply()
    }
    
    fun getSessionKey(): String? {
        return encryptedPrefs.getString(KEY_SESSION_KEY, null)
    }
    
    // Desktop connection info
    suspend fun storeDesktopInfo(ip: String, port: Int) = withContext(Dispatchers.IO) {
        encryptedPrefs.edit()
            .putString(KEY_DESKTOP_IP, ip)
            .putInt(KEY_DESKTOP_PORT, port)
            .putBoolean(KEY_DEVICE_PAIRED, true)
            .apply()
    }
    
    fun getDesktopIp(): String? {
        return encryptedPrefs.getString(KEY_DESKTOP_IP, null)
    }
    
    fun getDesktopPort(): Int {
        return encryptedPrefs.getInt(KEY_DESKTOP_PORT, 8443)
    }
    
    fun isDevicePaired(): Boolean {
        return encryptedPrefs.getBoolean(KEY_DEVICE_PAIRED, false)
    }
    
    // Clear all tokens (logout/unpair)
    suspend fun clearAllTokens() = withContext(Dispatchers.IO) {
        encryptedPrefs.edit().clear().apply()
    }
    
    // Check if tokens exist
    fun hasValidTokens(): Boolean {
        return getAccessToken() != null && isDevicePaired()
    }
}