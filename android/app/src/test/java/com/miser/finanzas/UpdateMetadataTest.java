package com.miser.finanzas;

import static org.junit.Assert.*;
import org.junit.Test;

/** Pure Java metadata tests; runnable with JUnit without an Android SDK. */
public class UpdateMetadataTest {
    private static final String APK =
        "https://github.com/jacksonandresrosales/MiSer/releases/download/android-build-42/MiSer.apk";
    private static final String SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    private Object[] fields() {
        return new Object[] {1, "com.miser.finanzas", 42, "1.0.42", APK, SHA, 1024L};
    }

    private UpdateMetadata metadata(Object[] fields) {
        return new UpdateMetadata(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5], fields[6]);
    }

    private void invalid(int field, Object... values) {
        for (Object value : values) {
            Object[] fields = fields();
            fields[field] = value;
            assertThrows("field " + field + ": " + value, IllegalArgumentException.class, () -> metadata(fields));
        }
    }

    @Test
    public void acceptsSchemaAndComparesVersionsMonotonically() {
        UpdateMetadata update = metadata(fields());
        assertEquals(42, update.versionCode);
        assertEquals("1.0.42", update.versionName);
        assertEquals(1024, update.size);
        assertEquals(APK, update.apkUrl);
        assertTrue(update.isNewerThan(41));
        assertFalse(update.isNewerThan(42));
        assertFalse(update.isNewerThan(43));
        assertFalse(update.isNewerThan(Long.MAX_VALUE));
    }

    @Test
    public void rejectsInvalidSchemaPackageAndVersionsWithoutCoercion() {
        invalid(0, 0, 2, "1", 1.0, null);
        invalid(1, "other.app", "com.miser.finanzas ", null);
        invalid(2, -1, 0, "42", 42.0, (long) Integer.MAX_VALUE + 1, Long.MAX_VALUE, null);
        invalid(3, "", "   ", "a".repeat(81), 42, null);
    }

    @Test
    public void acceptsIntegerBoundariesAndNormalizesHash() {
        Object[] fields = fields();
        fields[2] = (long) Integer.MAX_VALUE;
        fields[3] = "a".repeat(80);
        fields[4] = APK.replace("android-build-42", "android-build-" + Integer.MAX_VALUE);
        fields[5] = SHA.toUpperCase(java.util.Locale.ROOT);
        fields[6] = UpdateMetadata.MAX_APK_BYTES;
        UpdateMetadata update = metadata(fields);
        assertEquals(Integer.MAX_VALUE, update.versionCode);
        assertEquals(SHA, update.sha256);
        assertEquals(UpdateMetadata.MAX_APK_BYTES, update.size);
    }

    @Test
    public void rejectsInvalidHashAndSize() {
        invalid(5, SHA.substring(1), SHA + "0", "g".repeat(64), null);
        invalid(6, -1L, 0L, "1024", 1024.0, UpdateMetadata.MAX_APK_BYTES + 1, null);
    }

    @Test
    public void acceptsOnlyImmutableReleaseApkUrls() {
        invalid(4, APK.replace("https:", "http:"), APK.replace("MiSer", "Other"),
            APK.replace("android-build-42", "android-latest"), APK.replace("42", "0"),
            APK.replace("android-build-42", "android-build-41"),
            APK.replace("github.com", "github.com:443"),
            APK.replace("42", "-1"), APK.replace("MiSer.apk", "Other.apk"),
            APK + "?download=1", APK + "#fragment", APK.replace("github.com", "github.com.evil.test"),
            APK.replace("github.com", "evil.test@github.com"),
            APK.replace("github.com", "github.com:444"),
            APK.replace("MiSer.apk", "%4diSer.apk"),
            "https://release-assets.githubusercontent.com/asset.apk", null);
    }

    @Test
    public void permitsOnlyTheExactFixedBackupManifestUrl() {
        String backup = UpdateMetadata.FALLBACK_CHANNEL_URL;
        assertEquals("https://github.com/jacksonandresrosales/MiSer/releases/download/android-latest/previous-update.json",
            backup);
        assertNotNull(UpdateMetadata.trustedUri(backup));
        invalid(4, backup);
        for (String url : new String[] {backup.replace("https:", "http:"), backup + "?download=1",
            backup + "#fragment", backup.replace("github.com", "github.com:443"),
            backup.replace("previous-update.json", "backup-update.json"),
            backup.replace("android-latest", "android-other"), backup.replace("MiSer", "Other")}) {
            assertThrows(url, IllegalArgumentException.class, () -> UpdateMetadata.trustedUri(url));
        }
    }

    @Test
    public void permitsOnlyHttpsRedirectsToExactAssetHosts() {
        assertNotNull(UpdateMetadata.trustedUri(UpdateMetadata.CHANNEL_URL));
        for (String host : new String[] {"release-assets.githubusercontent.com", "objects.githubusercontent.com",
            "github-releases.githubusercontent.com"}) {
            assertNotNull(UpdateMetadata.trustedUri("https://" + host + "/asset?signature=test"));
        }
        for (String url : new String[] {"http://release-assets.githubusercontent.com/asset",
            "https://raw.githubusercontent.com/file", "https://evil.githubusercontent.com/file",
            "https://github.com/other/repo/releases/download/android-build-42/MiSer.apk",
            "https://github.com/login", "https://github.com.evil.test/file",
            "https://user@objects.githubusercontent.com/file", "https://objects.githubusercontent.com:80/file",
            "https://objects.githubusercontent.com/file#fragment", "file:///tmp/apk", "javascript:alert(1)",
            "https://objects.githubusercontent.com/" + "a".repeat(8192)}) {
            assertThrows(url, IllegalArgumentException.class, () -> UpdateMetadata.trustedUri(url));
        }
    }
}
