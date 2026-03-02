package com.kalynt.mobile.security

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch

/**
 * Activity for scanning QR codes to pair with desktop
 */
class QRScannerActivity : ComponentActivity() {
    
    companion object {
        const val RESULT_PAIRING_SUCCESS = 100
        const val RESULT_PAIRING_FAILED = 101
        const val RESULT_CANCELLED = 102
        const val EXTRA_ERROR = "error"
    }
    
    private val scanLauncher = registerForActivityResult(ScanContract()) { result ->
        if (result.contents != null) {
            handleQRCode(result.contents)
        } else {
            setResult(RESULT_CANCELLED)
            finish()
        }
    }
    
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            startScan()
        } else {
            setResult(RESULT_CANCELLED)
            finish()
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            MaterialTheme {
                QRScannerScreen(
                    onRequestPermission = { checkAndRequestPermission() },
                    onStartScan = { startScan() },
                    onCancel = {
                        setResult(RESULT_CANCELLED)
                        finish()
                    }
                )
            }
        }
        
        // Check permission immediately
        checkAndRequestPermission()
    }
    
    private fun checkAndRequestPermission() {
        when {
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED -> {
                startScan()
            }
            else -> {
                permissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }
    }
    
    private fun startScan() {
        val options = ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt("Scan QR code from Kalynt Desktop")
            setCameraId(0)
            setBeepEnabled(true)
            setBarcodeImageEnabled(false)
            setOrientationLocked(false)
        }
        scanLauncher.launch(options)
    }
    
    private fun handleQRCode(contents: String) {
        // Return result to calling activity
        val resultIntent = android.content.Intent().apply {
            putExtra("qr_content", contents)
        }
        setResult(RESULT_PAIRING_SUCCESS, resultIntent)
        finish()
    }
}

@Composable
fun QRScannerScreen(
    onRequestPermission: () -> Unit,
    onStartScan: () -> Unit,
    onCancel: () -> Unit
) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Pair with Desktop",
                style = MaterialTheme.typography.headlineMedium
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = "Scan the QR code displayed in Kalynt Desktop to connect",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(32.dp))
            
            if (!hasPermission) {
                Button(
                    onClick = {
                        onRequestPermission()
                        hasPermission = ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.CAMERA
                        ) == PackageManager.PERMISSION_GRANTED
                    }
                ) {
                    Text("Grant Camera Permission")
                }
            } else {
                Button(
                    onClick = onStartScan,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Scan QR Code")
                }
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Cancel")
            }
        }
    }
}