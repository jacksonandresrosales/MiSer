import java.util.Properties

plugins {
    kotlin("multiplatform") version "2.4.20" apply false
    kotlin("plugin.serialization") version "2.4.20" apply false
    kotlin("plugin.compose") version "2.4.20" apply false
    id("org.jetbrains.compose") version "1.12.1" apply false
    id("com.android.application") version "9.3.1" apply false
    id("com.android.kotlin.multiplatform.library") version "9.3.1" apply false
}

// OneDrive can mark generated caches read-only. Allow local builds outside it.
val localSettings = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
localSettings.getProperty("miser.buildRoot")?.let { directory ->
    allprojects { layout.buildDirectory.set(file("$directory/$name")) }
}
