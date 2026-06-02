import java.util.Properties

plugins {
    id("com.android.application")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

android {
    namespace = "com.loopdeck.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.loopdeck.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
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
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}

// Keep Android Studio builds in sync with the Vite build when dist exists.
// If dist does not exist, the pre-bundled assets under app/src/main/assets/loopdeck are used.
tasks.register<Sync>("syncLoopDeckDist") {
    val distDir = rootProject.file("../dist")
    onlyIf { distDir.resolve("index.html").exists() }
    from(distDir)
    into(layout.projectDirectory.dir("src/main/assets/loopdeck"))
}

tasks.named("preBuild") {
    dependsOn("syncLoopDeckDist")
}
