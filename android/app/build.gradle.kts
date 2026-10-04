import java.util.Properties
import org.gradle.api.GradleException

plugins {
    id("com.android.application")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

val releaseSigningKeys = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
val hasReleaseSigning = keystorePropertiesFile.exists() && releaseSigningKeys.all { key ->
    !keystoreProperties.getProperty(key).isNullOrBlank()
}

fun releaseSigningProperty(key: String): String = keystoreProperties.getProperty(key)
    ?: throw GradleException("Missing $key in android/keystore.properties for signed release builds.")

val appVersionCode = providers.gradleProperty("loopdeckVersionCode").orElse("1").get().toIntOrNull()
    ?.takeIf { it in 1..2100000000 }
    ?: throw GradleException("loopdeckVersionCode must be in 1..2100000000.")
val appVersionName = providers.gradleProperty("loopdeckVersionName").orElse("0.1.0-dev").get()

android {
    namespace = "com.loopdeck.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.loopdeck.app"
        minSdk = 23
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = file(releaseSigningProperty("storeFile"))
                storePassword = releaseSigningProperty("storePassword")
                keyAlias = releaseSigningProperty("keyAlias")
                keyPassword = releaseSigningProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

tasks.matching { task -> task.name == "assembleRelease" || task.name == "bundleRelease" }.configureEach {
    doFirst {
        if (!providers.gradleProperty("loopdeckVersionCode").isPresent || !providers.gradleProperty("loopdeckVersionName").isPresent) {
            throw GradleException("Release builds require explicit loopdeckVersionCode and loopdeckVersionName properties.")
        }
        if (!hasReleaseSigning) {
            throw GradleException(
                "Signed release builds require android/keystore.properties with storeFile, storePassword, keyAlias, and keyPassword. " +
                    "Debug builds do not need signing secrets."
            )
        }
    }
}

tasks.register<Sync>("syncLoopDeckDist") {
    val distDir = rootProject.file("../dist")
    val embedScript = rootProject.file("../scripts/embed-android-image-assets.mjs")
    inputs.file(embedScript)
    from(distDir)
    into(layout.projectDirectory.dir("src/main/assets/loopdeck"))
    doLast {
        providers.exec {
            commandLine("node", embedScript.absolutePath, destinationDir.absolutePath)
        }.result.get().assertNormalExitValue()
    }
}

tasks.named("preBuild") {
    dependsOn("syncLoopDeckDist")
}
