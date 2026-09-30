import org.jetbrains.kotlin.gradle.targets.js.webpack.KotlinWebpackConfig

plugins {
    kotlin("multiplatform")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
}

kotlin {
    @OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)
    wasmJs {
        browser {
            commonWebpackConfig {
                outputFileName = "miser.js"
                devServer = (devServer ?: KotlinWebpackConfig.DevServer()).apply {
                    port = 8080
                    open = false
                }
            }
        }
        binaries.executable()
    }
    sourceSets {
        getByName("wasmJsMain").resources.srcDir(rootProject.layout.projectDirectory.dir("../public"))
        commonMain.dependencies {
            implementation(project(":shared"))
            implementation("org.jetbrains.compose.ui:ui:1.12.1")
        }
    }
}
