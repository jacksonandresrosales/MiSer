import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("multiplatform")
    kotlin("plugin.serialization")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
    id("com.android.kotlin.multiplatform.library")
}

kotlin {
    android {
        namespace = "com.miser.shared"
        compileSdk = 36
        minSdk = 26
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
        withHostTest {}
    }
    // JVM runs the shared data compatibility tests without an emulator.
    jvm()
    @OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)
    wasmJs { browser() }

    sourceSets {
        commonMain.dependencies {
            implementation("org.jetbrains.compose.runtime:runtime:1.12.1")
            implementation("org.jetbrains.compose.foundation:foundation:1.12.1")
            implementation("org.jetbrains.compose.material3:material3:1.9.0")
            implementation("org.jetbrains.compose.material:material-icons-extended:1.7.3")
            implementation("org.jetbrains.compose.ui:ui:1.12.1")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
            implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.7.1")
        }
        commonTest.dependencies { implementation(kotlin("test")) }
    }
}
