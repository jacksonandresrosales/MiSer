package com.miser.finanzas

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.core.content.FileProvider
import com.miser.shared.AppStorage
import com.miser.shared.MiserApp
import com.miser.shared.Screen
import java.io.File

class MainActivity : ComponentActivity() {
    private val reducedMotion = mutableStateOf(false)

    override fun onResume() {
        super.onResume()
        reducedMotion.value = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val preferences = getSharedPreferences("miser-preview", MODE_PRIVATE)
        val storage = object : AppStorage {
            override fun load(): String? = preferences.getString("data", null)
            override fun save(json: String) { check(preferences.edit().putString("data", json).commit()) }
            override fun export(json: String) {
                val directory = File(cacheDir, "exports").apply { mkdirs() }
                val file = File(directory, "miser-datos.json").apply { writeText(json) }
                val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.exports", file)
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "application/json"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(Intent.createChooser(intent, "Exportar copia de MiSer"))
            }
        }
        setContent {
            val screen = rememberSaveable { mutableStateOf(Screen.Summary) }
            BackHandler(enabled = screen.value != Screen.Summary) { screen.value = Screen.Summary }
            MiserApp(storage, screen, reducedMotion.value)
        }
    }
}
