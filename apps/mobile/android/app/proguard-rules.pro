# ProGuard rules for Kalynt Mobile
# Keep security-related classes
-keep class com.kalynt.mobile.security.** { *; }
-keepclassmembers class com.kalynt.mobile.security.** { *; }

# Keep data models for serialization
-keep class com.kalynt.mobile.p2p.** { *; }
-keepclassmembers class com.kalynt.mobile.p2p.** { *; }

# Keep database entities
-keep class com.kalynt.mobile.local.entity.** { *; }

# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-keepnames class kotlinx.serialization.** { *; }
-dontnote kotlinx.serialization.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# Koin
-keep class org.koin.** { *; }

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
}
