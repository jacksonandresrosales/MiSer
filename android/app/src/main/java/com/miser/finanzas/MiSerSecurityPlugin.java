package com.miser.finanzas;

import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.view.WindowManager;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

@CapacitorPlugin(name = "MiSerSecurity")
public class MiSerSecurityPlugin extends Plugin {
    private static final String KEY_ALIAS = "miser.finance.v1";
    private static final int MAX_BYTES = 32 * 1024 * 1024;
    private static final int AUTH = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile boolean unlocked;
    private long pausedAt;
    private boolean prompting;
    private boolean appCheckInitialized;

    private boolean enabled() { return getContext().getSharedPreferences("miser_security", 0).getBoolean("lock_enabled", false); }

    @Override public void load() {
        unlocked = !enabled();
        updatePrivacyFlag();
        // Shared exports are deliberately temporary; never remove pending recovery or cloud data.
        io.execute(() -> {
            File[] files = new File(getContext().getCacheDir(), "exports").listFiles();
            if (files != null) for (File file : files) {
                if (file.isFile() && file.getName().matches("miser(?:-recuperacion)?-[A-Za-z0-9-]+\\.json")
                    && System.currentTimeMillis() - file.lastModified() > 24L * 60 * 60 * 1000) file.delete();
            }
        });
    }

    private void updatePrivacyFlag() {
        getActivity().runOnUiThread(() -> {
            if (enabled()) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        });
    }

    @Override protected void handleOnPause() { if (!prompting) pausedAt = SystemClock.elapsedRealtime(); }
    @Override protected void handleOnResume() {
        if (!prompting && enabled() && pausedAt > 0 && SystemClock.elapsedRealtime() - pausedAt >= 60_000) unlocked = false;
    }
    @Override protected void handleOnDestroy() { io.shutdownNow(); }

    private JSObject lockStatus() {
        return new JSObject().put("enabled", enabled()).put("unlocked", !enabled() || unlocked)
            .put("available", BiometricManager.from(getContext()).canAuthenticate(AUTH) == BiometricManager.BIOMETRIC_SUCCESS);
    }
    @PluginMethod public void getLockStatus(PluginCall call) { call.resolve(lockStatus()); }
    @PluginMethod public void authenticate(PluginCall call) { prompt(call, null); }
    @PluginMethod public void configureLock(PluginCall call) {
        Boolean next = call.getBoolean("enabled");
        if (next == null) { call.reject("Configuración inválida", "INVALID_ARGUMENT"); return; }
        prompt(call, next);
    }

    private void prompt(PluginCall call, Boolean next) {
        getActivity().runOnUiThread(() -> {
            if (prompting) { call.reject("Ya hay una comprobación en curso", "BUSY"); return; }
            if (BiometricManager.from(getContext()).canAuthenticate(AUTH) != BiometricManager.BIOMETRIC_SUCCESS) {
                call.reject("Configura una huella o bloqueo de pantalla en Android", "UNAVAILABLE"); return;
            }
            prompting = true;
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    prompting = false;
                    if (next != null && !getContext().getSharedPreferences("miser_security", 0).edit().putBoolean("lock_enabled", next).commit()) {
                        call.reject("No se pudo guardar el bloqueo", "STORAGE_FAILED"); return;
                    }
                    unlocked = true;
                    pausedAt = 0;
                    updatePrivacyFlag();
                    call.resolve(lockStatus());
                }
                @Override public void onAuthenticationError(int code, CharSequence message) {
                    prompting = false;
                    call.reject("No se completó la verificación", "AUTH_CANCELLED");
                }
            });
            prompt.authenticate(new BiometricPrompt.PromptInfo.Builder().setTitle("Desbloquear MiSer")
                .setSubtitle("Usa tu huella o el bloqueo de pantalla del teléfono").setAllowedAuthenticators(AUTH).build());
        });
    }

    private AtomicFile file(String key) throws Exception {
        if (key == null || !key.matches("miser-(?:finance-cache|pending)-[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException();
        byte[] hash = MessageDigest.getInstance("SHA-256").digest(key.getBytes(StandardCharsets.UTF_8));
        StringBuilder name = new StringBuilder();
        for (byte b : hash) name.append(String.format("%02x", b & 255));
        File directory = new File(getContext().getNoBackupFilesDir(), "finance");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException();
        return new AtomicFile(new File(directory, name + ".bin"));
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return (SecretKey) store.getKey(KEY_ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod public void get(PluginCall call) {
        io.execute(() -> {
            try {
                if (enabled() && !unlocked) { call.reject("Desbloquea MiSer", "LOCKED"); return; }
                String name = call.getString("key");
                AtomicFile file = file(name);
                if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) { call.resolve(new JSObject().put("value", org.json.JSONObject.NULL)); return; }
                if (file.getBaseFile().length() > MAX_BYTES + 29 || new File(file.getBaseFile() + ".bak").length() > MAX_BYTES + 29) throw new IllegalArgumentException();
                byte[] saved = file.readFully();
                String value = new String(FinanceCipher.open(name, saved, key()), StandardCharsets.UTF_8);
                call.resolve(new JSObject().put("value", value));
            } catch (Exception failure) { call.reject("No se pudo leer la recuperación cifrada; no se ha eliminado", "STORAGE_FAILED"); }
        });
    }

    @PluginMethod public void set(PluginCall call) {
        io.execute(() -> {
            FileOutputStream output = null;
            AtomicFile target = null;
            try {
                String name = call.getString("key"), value = call.getString("value");
                if (value == null || value.length() > MAX_BYTES) throw new IllegalArgumentException();
                target = file(name);
                byte[] plain = value.getBytes(StandardCharsets.UTF_8);
                byte[] encrypted = FinanceCipher.seal(name, plain, key());
                output = target.startWrite();
                output.write(encrypted);
                target.finishWrite(output);
                call.resolve();
            } catch (Exception failure) {
                if (target != null && output != null) target.failWrite(output);
                call.reject("No se pudo guardar la recuperación cifrada", "STORAGE_FAILED");
            }
        });
    }

    @PluginMethod public void remove(PluginCall call) {
        io.execute(() -> {
            try {
                if (enabled() && !unlocked) { call.reject("Desbloquea MiSer", "LOCKED"); return; }
                AtomicFile target = file(call.getString("key"));
                target.delete();
                if (target.getBaseFile().exists()) throw new IllegalStateException();
                call.resolve();
            } catch (Exception failure) { call.reject("No se pudo eliminar la copia local", "STORAGE_FAILED"); }
        });
    }

    @PluginMethod public void getAppCheckToken(PluginCall call) {
        if (!appCheckInitialized) {
            FirebaseAppCheck.getInstance().installAppCheckProviderFactory(PlayIntegrityAppCheckProviderFactory.getInstance());
            appCheckInitialized = true;
        }
        FirebaseAppCheck.getInstance().getAppCheckToken(false).addOnSuccessListener(result -> call.resolve(new JSObject()
            .put("token", result.getToken()).put("expireTimeMillis", result.getExpireTimeMillis())))
            .addOnFailureListener(error -> call.reject("No se pudo verificar esta instalación", "APP_CHECK_FAILED"));
    }
}
