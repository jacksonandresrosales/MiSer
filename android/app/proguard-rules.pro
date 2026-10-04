# Add project specific ProGuard rules here.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keep class com.miser.finanzas.UpdateWorker { public <init>(...); }
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
# The authentication plugin references its optional, compileOnly Facebook provider.
# MiSer enables google.com only; do not bundle an unused Facebook SDK or silence other errors.
-dontwarn com.facebook.CallbackManager
-dontwarn com.facebook.CallbackManager$Factory
-dontwarn com.facebook.FacebookCallback
-dontwarn com.facebook.login.LoginManager
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
