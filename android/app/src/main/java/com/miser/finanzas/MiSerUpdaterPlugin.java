package com.miser.finanzas;

import android.Manifest;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Public fixed-channel updater. No tokens, embedded keys, URL arguments or silent installs.
 * Only a primary-channel HTTP 404 tries the fixed previous-update.json backup once.
 * Both manifests use identical validation; if both are missing, preserve the primary error.
 * check() -> {currentVersionCode, currentVersionName, available, update?: {versionCode,
 * versionName, size}, notificationsEnabled, backgroundEnabled}.
 * getStatus() -> same status with available:false and no update; installed/settings only, no network.
 * install() -> {status: "permission-required" | "installer-opened" | "up-to-date"}; retry after settings.
 * configure({enabled: boolean}) -> {backgroundEnabled, notificationsEnabled}.
 * openNotificationSettings() -> void; check() on app mount/resume refreshes the UI.
 * Event updateRequested({}) is retained for cold-start listeners after an update notification tap.
 * The web listener should clear its dismissed banner and call check().
 * Background opt-in is persisted even when notifications are denied; the worker then stays quiet.
 * Errors: CHANNEL_UNAVAILABLE (unpublished channel), NETWORK_ERROR, INVALID_UPDATE,
 * DOWNLOAD_FAILED, VERIFY_FAILED, INSTALL_FAILED, BUSY, CONFIGURE_FAILED, SETTINGS_FAILED, STATUS_FAILED;
 * invalid configure uses INVALID_ARGUMENT.
 * Limits: manifest 16 KiB, APK 200 MiB, versionName 80 characters, five HTTPS redirects.
 * Only current installed signer certificates are accepted (no certificate rotation).
 */
@CapacitorPlugin(name = "MiSerUpdater", permissions = {
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class MiSerUpdaterPlugin extends Plugin {
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final AtomicBoolean installing = new AtomicBoolean(false);
    private boolean configuring;
    private volatile boolean destroyed;

    @Override
    public void load() {
        UpdateWorker.ensureChannel(getContext());
        UpdateWorker.schedule(getContext());
        // Keep successful APKs for 24 hours so the external installer can finish reading them.
        network.execute(() -> {
            File[] files = new File(getContext().getCacheDir(), "updates").listFiles();
            if (files == null) return;
            long cutoff = System.currentTimeMillis() - java.util.concurrent.TimeUnit.HOURS.toMillis(24);
            for (File file : files) {
                if (file.isFile() && file.lastModified() < cutoff) file.delete();
            }
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            call.resolve(currentStatus());
        } catch (Exception e) {
            call.reject("Cannot read installed app status", "STATUS_FAILED");
        }
    }

    @PluginMethod
    public void check(PluginCall call) {
        network.execute(() -> {
            try {
                UpdateMetadata update = UpdateClient.check();
                JSObject result = currentStatus();
                boolean available = update.isNewerThan(result.getLong("currentVersionCode"));
                result.put("available", available);
                if (available) result.put("update", new JSObject().put("versionCode", update.versionCode)
                    .put("versionName", update.versionName).put("size", update.size));
                call.resolve(result);
            } catch (Exception e) {
                reject(call, e, "NETWORK_ERROR", "Cannot check for updates");
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (!installing.compareAndSet(false, true)) {
            call.reject("An update installation is already in progress", "BUSY");
            return;
        }
        network.execute(() -> {
            try {
                // Never reuse metadata supplied by JS or a previous check().
                UpdateMetadata update = UpdateClient.check();
                if (!update.isNewerThan(UpdateClient.versionCode(UpdateClient.installed(getContext())))) {
                    installing.set(false);
                    call.resolve(new JSObject().put("status", "up-to-date"));
                    return;
                }
                if (!canInstall()) {
                    bridge.executeOnMainThread(() -> openInstaller(call, null));
                    return;
                }
                File apk = UpdateClient.downloadAndVerify(getContext(), update);
                if (destroyed) {
                    apk.delete();
                    installing.set(false);
                    call.reject("The app closed before installation", "INSTALL_FAILED");
                    return;
                }
                bridge.executeOnMainThread(() -> openInstaller(call, apk));
            } catch (Exception e) {
                installing.set(false);
                reject(call, e, "INSTALL_FAILED", "Cannot prepare update installation");
            }
        });
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private void openInstaller(PluginCall call, File apk) {
        boolean opened = false;
        try {
            if (destroyed || getActivity().isFinishing()) {
                throw new IllegalStateException("The app is closing");
            }
            if (apk == null || !canInstall()) {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName())));
                call.resolve(new JSObject().put("status", "permission-required"));
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(ClipData.newRawUri("MiSer APK", uri));
            getActivity().startActivity(intent);
            opened = true;
            // This confirms only that Android's installer UI opened, never that installation succeeded.
            call.resolve(new JSObject().put("status", "installer-opened"));
        } catch (Exception e) {
            call.reject("Cannot open Android installer or installation settings", "INSTALL_FAILED");
        } finally {
            if (!opened && apk != null) apk.delete();
            installing.set(false);
        }
    }

    @PluginMethod
    public void configure(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("enabled must be a boolean", "INVALID_ARGUMENT");
            return;
        }
        bridge.executeOnMainThread(() -> {
            if (configuring) {
                call.reject("Notification configuration is already in progress", "BUSY");
                return;
            }
            configuring = true;
            try {
                if (enabled && Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(),
                    Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissionForAlias("notifications", call, "notificationsPermissionResult");
                } else {
                    finishConfiguration(call);
                }
            } catch (Exception e) {
                configuring = false;
                call.reject("Cannot request notification permission", "CONFIGURE_FAILED");
            }
        });
    }

    @PermissionCallback
    private void notificationsPermissionResult(PluginCall call) {
        finishConfiguration(call);
    }

    private void finishConfiguration(PluginCall call) {
        try {
            if (call != null) {
                UpdateWorker.configure(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled")));
                call.resolve(configuration());
            }
        } catch (Exception e) {
            if (call != null) call.reject("Cannot configure update checks", "CONFIGURE_FAILED");
        } finally {
            configuring = false;
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        bridge.executeOnMainThread(() -> {
            try {
                Intent intent;
                if (Build.VERSION.SDK_INT >= 26) {
                    boolean globallyEnabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled()
                        && (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(),
                            Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
                    if (globallyEnabled && !UpdateWorker.notificationsEnabled(getContext())) {
                        intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
                            .putExtra(Settings.EXTRA_CHANNEL_ID, UpdateWorker.CHANNEL_ID);
                    } else {
                        intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                    }
                } else {
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getContext().getPackageName()));
                }
                getActivity().startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("Cannot open notification settings", "SETTINGS_FAILED");
            }
        });
    }

    private JSObject currentStatus() throws PackageManager.NameNotFoundException {
        PackageInfo current = UpdateClient.installed(getContext());
        return configuration().put("currentVersionCode", UpdateClient.versionCode(current))
            .put("currentVersionName", current.versionName == null ? "" : current.versionName)
            .put("available", false);
    }

    private JSObject configuration() {
        return new JSObject().put("backgroundEnabled", UpdateWorker.backgroundEnabled(getContext()))
            .put("notificationsEnabled", UpdateWorker.notificationsEnabled(getContext()));
    }

    private void reject(PluginCall call, Exception exception, String fallback, String message) {
        if (exception instanceof UpdateClient.Failure) {
            UpdateClient.Failure failure = (UpdateClient.Failure) exception;
            call.reject(failure.getMessage(), failure.code);
        } else {
            // Avoid logging signed GitHub redirect URLs or request data to the JavaScript bridge.
            call.reject(message, fallback);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent != null && "com.miser.finanzas.OPEN_UPDATE".equals(intent.getAction())) {
            notifyListeners("updateRequested", new JSObject(), true);
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyed = true;
        network.shutdownNow();
    }
}
