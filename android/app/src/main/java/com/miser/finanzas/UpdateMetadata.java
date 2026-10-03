package com.miser.finanzas;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Pure Java validation at the public channel's trust boundary; no keys or tokens. */
final class UpdateMetadata {
    static final String PACKAGE_ID = "com.miser.finanzas";
    static final String CHANNEL_URL =
        "https://github.com/jacksonandresrosales/MiSer/releases/download/android-latest/update.json";
    static final String FALLBACK_CHANNEL_URL =
        "https://github.com/jacksonandresrosales/MiSer/releases/download/android-latest/previous-update.json";
    static final long MAX_APK_BYTES = 200L * 1024 * 1024;
    private static final String APK_PATH =
        "/jacksonandresrosales/MiSer/releases/download/android-build-[1-9][0-9]*/MiSer\\.apk";

    final int versionCode;
    final String versionName;
    final String apkUrl;
    final String sha256;
    final long size;

    UpdateMetadata(Object schemaVersion, Object packageId, Object versionCode, Object versionName,
                   Object apkUrl, Object sha256, Object size) {
        require(integer(schemaVersion, "schemaVersion") == 1, "Unsupported schemaVersion");
        require(PACKAGE_ID.equals(packageId), "Unexpected packageId");
        long code = integer(versionCode, "versionCode");
        require(code > 0 && code <= Integer.MAX_VALUE, "Invalid versionCode");
        this.versionCode = (int) code;
        require(versionName instanceof String, "Invalid versionName");
        this.versionName = (String) versionName;
        require(!this.versionName.trim().isEmpty() && this.versionName.length() <= 80,
            "Invalid versionName");
        require(apkUrl instanceof String, "Invalid apkUrl");
        this.apkUrl = (String) apkUrl;
        trustedUri(this.apkUrl);
        require(this.apkUrl.equals("https://github.com/jacksonandresrosales/MiSer/releases/download/android-build-"
            + this.versionCode + "/MiSer.apk"), "APK release must match versionCode exactly");
        require(sha256 instanceof String && ((String) sha256).matches("[0-9a-fA-F]{64}"),
            "Invalid sha256");
        this.sha256 = ((String) sha256).toLowerCase(Locale.ROOT);
        this.size = integer(size, "size");
        require(this.size > 0 && this.size <= MAX_APK_BYTES, "Invalid APK size");
    }

    boolean isNewerThan(long installedVersion) {
        return versionCode > installedVersion;
    }

    // Exact hosts only. Never allow arbitrary *.githubusercontent.com or JavaScript URLs.
    static URI trustedUri(String value) {
        try {
            URI uri = new URI(value);
            require(value.length() <= 8192 && "https".equals(uri.getScheme())
                && uri.getRawUserInfo() == null && uri.getRawFragment() == null
                && (uri.getPort() == -1 || uri.getPort() == 443), "Untrusted HTTPS URL");
            String host = uri.getHost();
            require("github.com".equals(host) || "release-assets.githubusercontent.com".equals(host)
                || "objects.githubusercontent.com".equals(host)
                || "github-releases.githubusercontent.com".equals(host), "Untrusted asset host");
            if ("github.com".equals(host)) {
                require(CHANNEL_URL.equals(value) || FALLBACK_CHANNEL_URL.equals(value)
                    || (uri.getRawPath().matches(APK_PATH)
                    && uri.getRawQuery() == null), "Untrusted GitHub release path");
            }
            return uri;
        } catch (URISyntaxException | NullPointerException e) {
            throw new IllegalArgumentException("Invalid URL", e);
        }
    }

    private static long integer(Object value, String field) {
        require(value instanceof Integer || value instanceof Long, "Invalid integer: " + field);
        return ((Number) value).longValue();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }
}
