plugins {
    id("com.android.application")
    kotlin("plugin.compose")
}

android {
    namespace = "com.miser.finanzas"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.miser.finanzas"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":shared"))
    implementation("androidx.activity:activity-compose:1.13.0")
}
