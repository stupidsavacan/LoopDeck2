import java.io.File
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

fun nonBlank(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

fun signingValue(vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
    nonBlank(keystoreProperties.getProperty(key))
        ?: nonBlank(providers.gradleProperty(key).orNull)
        ?: nonBlank(providers.environmentVariable(key).orNull)
}

fun defaultReleaseKeystoreFile(): File? = listOf(
    rootProject.file("loopdeck-release.jks"),
    rootProject.file("release.jks"),
    rootProject.file("app/loopdeck-release.jks"),
    rootProject.file("../loopdeck-release.jks")
).firstOrNull { it.exists() }

fun resolveSigningFile(path: String): File {
    val projectRelative = file(path)
    if (projectRelative.isAbsolute) return projectRelative

    val rootRelative = rootProject.file(path)
    return if (rootRelative.exists()) rootRelative else projectRelative
}

val releaseStoreFile = signingValue(
    "storeFile",
    "LOOPDECK_KEYSTORE_FILE",
    "LOOPDECK_STORE_FILE",
    "STUDYHOME_KEYSTORE_FILE"
)?.let(::resolveSigningFile) ?: defaultReleaseKeystoreFile()

val releaseStorePassword = signingValue(
    "storePassword",
    "LOOPDECK_KEYSTORE_PASSWORD",
    "LOOPDECK_STORE_PASSWORD",
    "STUDYHOME_KEYSTORE_PASSWORD"
)
val releaseKeyAlias = signingValue(
    "keyAlias",
    "LOOPDECK_KEY_ALIAS",
    "LOOPDECK_KEYSTORE_ALIAS",
    "STUDYHOME_KEY_ALIAS"
)
val releaseKeyPassword = signingValue(
    "keyPassword",
    "LOOPDECK_KEY_PASSWORD",
    "LOOPDECK_KEYSTORE_KEY_PASSWORD",
    "STUDYHOME_KEY_PASSWORD"
)

val hasReleaseSigning = listOf(
    releaseStoreFile?.path,
    releaseStorePassword,
    releaseKeyAlias,
    releaseKeyPassword
).all { !it.isNullOrBlank() }

fun requireReleaseSigning() {
    if (!hasReleaseSigning) {
        throw GradleException(
            "Signed release builds require a JKS keystore plus storePassword, keyAlias, and keyPassword. " +
                "Use android/keystore.properties or LOOPDECK_* Gradle properties/environment variables. " +
                "Debug builds do not need release signing secrets."
        )
    }

    if (releaseStoreFile?.exists() != true) {
        throw GradleException("Release keystore file does not exist: ${releaseStoreFile?.path}")
    }
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

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            if (hasReleaseSigning) {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
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
        requireReleaseSigning()
    }
}

tasks.register<Sync>("syncLoopDeckDist") {
    val distDir = rootProject.file("../dist")
    from(distDir)
    into(layout.projectDirectory.dir("src/main/assets/loopdeck"))
}

tasks.named("preBuild") {
    dependsOn("syncLoopDeckDist")
}
