// Top-level build file
plugins {
    id("com.android.application") version "8.2.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.20" apply false
    id("com.google.devtools.ksp") version "1.9.20-1.0.14" apply false
}

buildscript {
    extra.apply {
        set("compose_version", "1.5.4")
        set("room_version", "2.6.1")
        set("coroutines_version", "1.7.3")
        set("lifecycle_version", "2.6.2")
    }
}
