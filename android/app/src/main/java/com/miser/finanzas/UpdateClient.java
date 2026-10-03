package com.miser.finanzas;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.util.JsonReader;
import android.util.JsonToken;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import javax.net.ssl.HttpsURLConnection;

final class UpdateClient {
    private static final int MAX_JSON_BYTES = 16 * 1024;

    static final class Failure extends IOException {
        final String code;

        Failure(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    static UpdateMetadata check() throws Exception {
        try {
            return readMetadata(UpdateMetadata.CHANNEL_URL);
        } catch (Failure primary) {
            if (!"CHANNEL_UNAVAILABLE".equals(primary.code)) throw primary;
            // The publisher can briefly remove update.json while replacing its GitHub release asset.
            // Try the fixed backup once, only for HTTP 404; never mask invalid data or network failures.
            try {
                return readMetadata(UpdateMetadata.FALLBACK_CHANNEL_URL);
            } catch (Failure fallback) {
                if ("CHANNEL_UNAVAILABLE".equals(fallback.code)) throw primary;
                throw fallback;
            }
        }
    }

    private static UpdateMetadata readMetadata(String channelUrl) throws Exception {
        try {
            return fetchMetadata(channelUrl);
        } catch (Failure e) {
            throw e;
        } catch (IllegalArgumentException | java.nio.charset.CharacterCodingException e) {
            throw new Failure("INVALID_UPDATE", "Invalid update manifest");
        } catch (IOException e) {
            throw new Failure("NETWORK_ERROR", "Cannot reach the update channel");
        }
    }

    private static UpdateMetadata fetchMetadata(String channelUrl) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        HttpsURLConnection connection = open(channelUrl, deadline);
        try {
            long length = connection.getContentLengthLong();
            if (length > MAX_JSON_BYTES) throw new Failure("INVALID_UPDATE", "Update manifest too large");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    checkDeadline(deadline);
                    if (bytes.size() + count > MAX_JSON_BYTES) {
                        throw new Failure("INVALID_UPDATE", "Update manifest too large");
                    }
                    bytes.write(buffer, 0, count);
                }
            }
            String json = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
            return parseMetadata(json);
        } finally {
            connection.disconnect();
        }
    }

    private static UpdateMetadata parseMetadata(String json) throws IOException {
        // Streaming the flat schema rejects nested JSON before it can consume a recursive parser's stack.
        try (JsonReader reader = new JsonReader(new StringReader(json))) {
            reader.setLenient(false);
            Map<String, Object> fields = new HashMap<>();
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (fields.containsKey(name)) throw new IOException("Duplicate manifest field");
                JsonToken token = reader.peek();
                Object value;
                if (token == JsonToken.STRING) {
                    value = reader.nextString();
                } else if (token == JsonToken.NUMBER) {
                    String number = reader.nextString();
                    if (!number.matches("-?(0|[1-9][0-9]*)")) throw new IOException("Expected integer");
                    value = Long.parseLong(number);
                } else if (token == JsonToken.BOOLEAN) {
                    value = reader.nextBoolean();
                } else if (token == JsonToken.NULL) {
                    reader.nextNull();
                    value = null;
                } else {
                    throw new IOException("Expected flat update manifest");
                }
                fields.put(name, value);
            }
            reader.endObject();
            if (reader.peek() != JsonToken.END_DOCUMENT) throw new IOException("Trailing manifest data");
            return new UpdateMetadata(fields.get("schemaVersion"), fields.get("packageId"),
                fields.get("versionCode"), fields.get("versionName"), fields.get("apkUrl"),
                fields.get("sha256"), fields.get("size"));
        } catch (IOException | IllegalStateException | IllegalArgumentException e) {
            throw new Failure("INVALID_UPDATE", "Invalid update manifest");
        }
    }

    static PackageInfo installed(Context context) throws PackageManager.NameNotFoundException {
        return context.getPackageManager().getPackageInfo(context.getPackageName(), signingFlags());
    }

    @SuppressWarnings("deprecation")
    static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    static File downloadAndVerify(Context context, UpdateMetadata update) throws Exception {
        File directory = new File(context.getCacheDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new Failure("DOWNLOAD_FAILED", "Cannot create update cache");
        }
        // A distinct file prevents a retry from overwriting an APK the installer is still reading.
        File apk;
        try {
            apk = File.createTempFile("miser-" + update.versionCode + "-", ".apk", directory);
        } catch (IOException e) {
            throw new Failure("DOWNLOAD_FAILED", "Cannot create APK file");
        }
        boolean verified = false;
        boolean verifying = false;
        HttpsURLConnection connection = null;
        try {
            long deadline = System.nanoTime() + TimeUnit.MINUTES.toNanos(5);
            connection = open(update.apkUrl, deadline);
            long declared = connection.getContentLengthLong();
            if (declared != -1 && declared != update.size) throw new Failure("VERIFY_FAILED", "APK size mismatch");
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long received = 0;
            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(apk)) {
                byte[] buffer = new byte[32768];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    checkDeadline(deadline);
                    received += count;
                    if (received > update.size) throw new Failure("VERIFY_FAILED", "APK exceeds declared size");
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
            }
            if (received != update.size || !MessageDigest.isEqual(digest.digest(), hex(update.sha256))) {
                throw new Failure("VERIFY_FAILED", "APK size or SHA-256 mismatch");
            }
            verifying = true;
            verifyPackage(context, apk, update);
            verified = true;
            return apk;
        } catch (Exception e) {
            if (e instanceof Failure && "VERIFY_FAILED".equals(((Failure) e).code)) throw e;
            throw new Failure(verifying ? "VERIFY_FAILED" : "DOWNLOAD_FAILED",
                verifying ? "Cannot verify APK package and signature" : "Cannot download APK");
        } finally {
            if (connection != null) connection.disconnect();
            if (!verified && !apk.delete()) apk.deleteOnExit();
        }
    }

    static void verifyPackage(Context context, File apk, UpdateMetadata update) throws Exception {
        PackageManager manager = context.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), signingFlags());
        PackageInfo current = installed(context);
        if (archive == null || !UpdateMetadata.PACKAGE_ID.equals(context.getPackageName())
            || !UpdateMetadata.PACKAGE_ID.equals(archive.packageName)
            || versionCode(archive) != update.versionCode
            || !update.versionName.equals(archive.versionName)
            || !update.isNewerThan(versionCode(current))) {
            throw new Failure("VERIFY_FAILED", "APK package or version mismatch");
        }
        // Require the same current signer set, including all signers for multi-signed packages.
        // Certificate rotation is deliberately not accepted by this channel.
        Set<Signature> currentSigners = signers(current);
        if (currentSigners.isEmpty() || !currentSigners.equals(signers(archive))) {
            throw new Failure("VERIFY_FAILED", "APK signing certificate does not match the installed app");
        }
    }

    @SuppressWarnings("deprecation")
    private static int signingFlags() {
        return Build.VERSION.SDK_INT >= 28
            ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }

    @SuppressWarnings("deprecation")
    private static Set<Signature> signers(PackageInfo info) {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= 28) {
            signatures = info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        return signatures == null ? new HashSet<>() : new HashSet<>(Arrays.asList(signatures));
    }

    private static byte[] hex(String value) {
        byte[] bytes = new byte[32];
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    private static HttpsURLConnection open(String address, long deadline) throws IOException {
        for (int redirects = 0; redirects <= 5; redirects++) {
            checkDeadline(deadline);
            URI uri = UpdateMetadata.trustedUri(address);
            HttpsURLConnection connection = (HttpsURLConnection) uri.toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Cache-Control", "no-cache");
            connection.setRequestProperty("User-Agent", "MiSer-Android-Updater/1");
            boolean keep = false;
            try {
                int status = connection.getResponseCode();
                if (status == HttpURLConnection.HTTP_OK) {
                    checkDeadline(deadline);
                    keep = true;
                    return connection;
                }
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Missing redirect location");
                    address = uri.resolve(location).toString();
                    // Validate before the next connection, including downgrade and host checks.
                    UpdateMetadata.trustedUri(address);
                } else {
                    if (status == 404) throw new Failure("CHANNEL_UNAVAILABLE", "Update release is not published");
                    throw new IOException("Update server returned HTTP " + status);
                }
            } finally {
                if (!keep) connection.disconnect();
            }
        }
        throw new IOException("Too many update redirects");
    }

    private static void checkDeadline(long deadline) throws IOException {
        if (Thread.currentThread().isInterrupted() || System.nanoTime() >= deadline) {
            throw new IOException("Update request interrupted or timed out");
        }
    }
}
