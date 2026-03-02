package com.kalynt.mobile

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.kalynt.mobile.security.QRScannerActivity
import com.kalynt.mobile.ui.KalyntApp
import com.kalynt.mobile.ui.theme.KalyntTheme
import org.koin.android.ext.android.inject

class MainActivity : ComponentActivity() {

    private val viewModel: MainViewModel by inject()

    private val qrScanLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == QRScannerActivity.RESULT_PAIRING_SUCCESS) {
            val qrContent = result.data?.getStringExtra("qr_content")
            qrContent?.let {
                viewModel.handleQRCode(it)
            }
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        // Notification permission handled
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Request notification permission on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        setContent {
            KalyntTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    KalyntApp(
                        viewModel = viewModel,
                        onScanQR = { startQRScan() }
                    )
                }
            }
        }
    }

    private fun startQRScan() {
        val intent = android.content.Intent(this, QRScannerActivity::class.java)
        qrScanLauncher.launch(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        viewModel.cleanup()
    }
}
