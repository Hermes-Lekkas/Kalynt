package com.kalynt.mobile.security

import android.content.Context
import android.os.Build
import java.io.File

/**
 * Security hardening utilities
 * Phase 9 implementation
 */
object SecurityHardening {
    
    /**
     * Check if device is rooted
     */
    fun isDeviceRooted(): Boolean {
        return checkTestKeys() || checkSuperUserApk() || checkSuBinary()
    }
    
    private fun checkTestKeys(): Boolean {
        val buildTags = Build.TAGS
        return buildTags != null && buildTags.contains("test-keys")
    }
    
    private fun checkSuperUserApk(): Boolean {
        return File("/system/app/Superuser.apk").exists()
    }
    
    private fun checkSuBinary(): Boolean {
        val paths = arrayOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/su/bin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su"
        )
        return paths.any { File(it).exists() }
    }
    
    /**
     * Certificate pinning configuration (to be implemented in OkHttp client)
     * This is a placeholder for the actual pinning implementation
     */
    fun getPinnedCertificate(): String {
        // In production, this would return the actual certificate hash
        // For development, we accept all certificates
        return "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    }
    
    /**
     * Anti-tampering check
     */
    fun verifyAppIntegrity(context: Context): Boolean {
        // Check if app is debug build
        val isDebug = context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
        
        // In production, reject debug builds
        return !isDebug || Build.TYPE != "user"
    }
}